import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { Event, Runflow } from "@discretion/model";
import { parse } from "@iarna/toml";
import type { Clock } from "./clock.js";
import { DiscretionError } from "./errors.js";
import { EventLog } from "./eventlog.js";
import { newId } from "./ids.js";
import { stableStringify } from "./json.js";
import { Logger } from "./logger.js";

/** Seconds a script node may run when it sets no `timeout`. */
export const defaultTimeoutSeconds = 600;

export interface RunOptions {
  /** Path to a `runflow/1` file. */
  workflow: string;
  /** Path to the JSON input file, if any. */
  input?: string;
  /** `~/.local/state/discretion`: holds `runs/`, `logs/` and `events.jsonl`. */
  stateDir: string;
  clock: Clock;
  /** The environment the runner itself runs in; only `PATH` and `HOME` pass through. */
  env?: NodeJS.ProcessEnv;
}

export interface RunResult {
  runId: string;
  runDir: string;
  /** `ended` when an end node was reached, `failed` when the runner stopped. */
  status: "ended" | "failed";
  /** The outcome of the end node reached. */
  outcome?: string;
  error?: DiscretionError;
}

type Script = Extract<Runflow["nodes"][string], { kind: "script" }>;

interface Step {
  node: string;
  attempt: number;
  exit: number | null;
  outcome?: string;
  timed_out?: true;
}

function invalid(path: string, detail: string): DiscretionError {
  return new DiscretionError(
    "D6005",
    `${path} is not a valid runflow/1 file: ${detail}`,
    "Fix the file so it matches schemas/runflow/1.json.",
  );
}

/** Reads and validates a `runflow/1` file. */
export function loadRunflow(path: string): Runflow {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new DiscretionError(
        "D6006",
        `The workflow file ${path} does not exist.`,
        "Check the name, or pass the path to a runflow/1 file.",
      );
    }
    throw error;
  }
  let raw: unknown;
  try {
    raw = parse(text);
  } catch (error) {
    throw invalid(path, (error as Error).message);
  }
  const checked = Runflow.safeParse(raw);
  if (!checked.success) {
    throw invalid(
      path,
      checked.error.issues
        .map((issue) => `${issue.path.join(".") || "(file)"}: ${issue.message}`)
        .join("; "),
    );
  }
  const flow = checked.data;
  const problems: string[] = [];
  const known = (name: string): boolean => Object.hasOwn(flow.nodes, name);
  if (!known(flow.workflow.start)) {
    problems.push(`start node ${flow.workflow.start} does not exist`);
  }
  for (const [name, node] of Object.entries(flow.nodes)) {
    if (!/^[A-Za-z0-9_-]+$/.test(name)) {
      problems.push(`node name ${name} may hold only letters, digits, _ and -`);
    }
    if (node.kind !== "script") {
      continue;
    }
    const outcomes = new Set(Object.values(node.exit));
    for (const outcome of [...outcomes].sort()) {
      if (!Object.hasOwn(node.on, outcome)) {
        problems.push(`node ${name} has no edge for outcome ${outcome}`);
      }
    }
    for (const [outcome, target] of Object.entries(node.on).sort()) {
      if (!outcomes.has(outcome)) {
        problems.push(
          `node ${name} has an edge for outcome ${outcome}, which its exit map never gives`,
        );
      }
      if (!known(target)) {
        problems.push(`node ${name} leads to ${target}, which does not exist`);
      }
    }
  }
  if (problems.length > 0) {
    throw invalid(path, problems.join("; "));
  }
  return flow;
}

/** A path stays as given; a bare name becomes `<cwd>/workflows/<name>.toml`. */
export function resolveWorkflow(name: string, cwd: string): string {
  if (name.includes("/") || name.endsWith(".toml")) {
    return isAbsolute(name) ? name : resolve(cwd, name);
  }
  return join(cwd, "workflows", `${name}.toml`);
}

function badInput(path: string, detail: string): DiscretionError {
  return new DiscretionError(
    "D6008",
    `The input file ${path} is not usable: ${detail}`,
    "Pass a JSON object; its capture_id, if any, must be a capture id.",
  );
}

/** The input as text and its capture id, or a refusal. */
function loadInput(path: string): { text: string; capture?: string } {
  let value: unknown;
  try {
    value = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw badInput(path, (error as Error).message);
  }
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw badInput(path, "it is not a JSON object");
  }
  const id = (value as Record<string, unknown>).capture_id;
  if (id === undefined) {
    return { text: stableStringify(value) };
  }
  const checked = Event.shape.capture_id.safeParse(id);
  if (!checked.success) {
    throw badInput(path, "capture_id is not a capture id");
  }
  return { text: stableStringify(value), capture: checked.data };
}

interface Attempt {
  code: number | null;
  timedOut: boolean;
  stdout: Buffer;
  stderr: Buffer;
}

function execute(command: string, env: NodeJS.ProcessEnv, seconds: number): Promise<Attempt> {
  return new Promise((done) => {
    const child = spawn("sh", ["-c", command], {
      env,
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    let timedOut = false;
    let spawnError: Error | undefined;
    child.stdout.on("data", (chunk: Buffer) => out.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => err.push(chunk));
    const timer = setTimeout(() => {
      timedOut = true;
      try {
        process.kill(-(child.pid ?? 0), "SIGKILL");
      } catch {
        child.kill("SIGKILL");
      }
    }, seconds * 1000);
    child.on("error", (error) => {
      spawnError = error;
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (spawnError !== undefined) {
        err.push(Buffer.from(`${spawnError.message}\n`));
      }
      done({
        code: spawnError === undefined ? code : null,
        timedOut,
        stdout: Buffer.concat(out),
        stderr: Buffer.concat(err),
      });
    });
  });
}

/** Executes a workflow to an end node, or until a node fails for good. */
export async function runWorkflow(options: RunOptions): Promise<RunResult> {
  const { clock, stateDir } = options;
  const flow = loadRunflow(options.workflow);
  const input = options.input === undefined ? { text: "{}" } : loadInput(options.input);
  const name = flow.workflow.name;
  const runId = newId("run", clock);
  const runDir = join(stateDir, "runs", name, runId);
  mkdirSync(runDir, { recursive: true });
  writeFileSync(join(runDir, "input.json"), input.text);

  const events = new EventLog(join(stateDir, "events.jsonl"), clock);
  const logger = new Logger({ dir: join(stateDir, "logs"), component: "runner", clock });
  const tie = {
    ...(input.capture === undefined ? {} : { capture_id: input.capture }),
    run_id: runId,
  };
  events.append({
    type: "run.started",
    source: "runner",
    ...tie,
    data: { workflow: name, version: flow.workflow.version },
  });
  logger.info("run started", { ...tie, fields: { workflow: name } });

  const parent = options.env ?? process.env;
  const base: NodeJS.ProcessEnv = {
    ...(parent.PATH === undefined ? {} : { PATH: parent.PATH }),
    ...(parent.HOME === undefined ? {} : { HOME: parent.HOME }),
    DISCRETION_RUN: runId,
    DISCRETION_RUN_DIR: runDir,
    DISCRETION_INPUT: join(runDir, "input.json"),
    DISCRETION_CAPTURE: input.capture ?? "",
  };

  const trail: Step[] = [];
  let outcome: string | undefined;
  let error: DiscretionError | undefined;
  let current = flow.workflow.start;
  while (outcome === undefined && error === undefined) {
    const node = flow.nodes[current];
    if (node === undefined) {
      throw new Error(`node ${current} vanished after validation`);
    }
    if (node.kind === "end") {
      outcome = node.outcome;
      break;
    }
    const next = await runNode(current, node, base, runDir, trail, logger, tie);
    if (typeof next === "string") {
      current = node.on[next] ?? current;
    } else {
      error = next;
    }
  }

  const status = error === undefined ? "ended" : "failed";
  const state = {
    run_id: runId,
    workflow: name,
    version: flow.workflow.version,
    status,
    ...(outcome === undefined ? {} : { outcome }),
    ...(error === undefined ? {} : { error_code: error.code, error: error.message }),
    trail,
  };
  writeFileSync(join(runDir, "run.json"), `${stableStringify(state)}\n`);
  events.append({
    type: "run.ended",
    source: "runner",
    ...tie,
    data: {
      workflow: name,
      status,
      ...(outcome === undefined ? {} : { outcome }),
      ...(error === undefined ? {} : { error_code: error.code }),
    },
  });
  if (error === undefined) {
    logger.info("run ended", { ...tie, fields: { workflow: name, outcome } });
  } else {
    logger.error("run failed", { ...tie, error, fields: { workflow: name } });
  }
  return {
    runId,
    runDir,
    status,
    ...(outcome === undefined ? {} : { outcome }),
    ...(error === undefined ? {} : { error }),
  };
}

/** Runs one script node, retrying unmapped exits and timeouts; returns its outcome or the failure. */
async function runNode(
  name: string,
  node: Script,
  base: NodeJS.ProcessEnv,
  runDir: string,
  trail: Step[],
  logger: Logger,
  tie: { capture_id?: string; run_id: string },
): Promise<string | DiscretionError> {
  const seconds = node.timeout ?? defaultTimeoutSeconds;
  const attempts = node.max_attempts ?? 1;
  const env = { ...base, DISCRETION_NODE: name };
  let reason = "";
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const result = await execute(node.run, env, seconds);
    writeFileSync(join(runDir, `${name}.${attempt}.stdout`), result.stdout);
    writeFileSync(join(runDir, `${name}.${attempt}.stderr`), result.stderr);
    const mapped =
      result.timedOut || result.code === null ? undefined : node.exit[String(result.code)];
    trail.push({
      node: name,
      attempt,
      exit: result.code,
      ...(mapped === undefined ? {} : { outcome: mapped }),
      ...(result.timedOut ? { timed_out: true as const } : {}),
    });
    if (mapped !== undefined) {
      logger.info("node ended", {
        ...tie,
        fields: { node: name, attempt, exit: result.code, outcome: mapped },
      });
      return mapped;
    }
    reason = result.timedOut
      ? `timed out after ${seconds}s`
      : result.code === null
        ? "did not exit with a code"
        : `exited with code ${result.code}, which its exit map does not list`;
    logger.warn("node attempt failed", { ...tie, fields: { node: name, attempt, reason } });
  }
  return new DiscretionError(
    "D6007",
    `Node ${name} failed after ${attempts} attempt${attempts === 1 ? "" : "s"}: ${reason}.`,
    `Read ${join(runDir, `${name}.${attempts}.stderr`)}, fix the script, or raise its timeout or max_attempts.`,
  );
}
