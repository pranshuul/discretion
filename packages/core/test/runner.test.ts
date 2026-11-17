import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Event } from "@discretion/model";
import { describe, expect, it } from "vitest";
import type { Clock } from "../src/clock.js";
import { DiscretionError } from "../src/errors.js";
import {
  defaultTimeoutSeconds,
  loadRunflow,
  resolveWorkflow,
  runWorkflow,
  type RunResult,
} from "../src/runner.js";
import { scratch } from "./helpers.js";

const clock: Clock = { now: () => new Date("2026-11-13T10:15:00Z") };
const capture = "cap_20261113_abc234";

interface Fixture {
  dir: string;
  stateDir: string;
  workflow: string;
}

/** Writes `workflows/flow.toml` with the given nodes under a `start = "a"` header. */
function fixture(nodes: string, start = "a"): Fixture {
  const dir = scratch();
  const stateDir = join(dir, "state");
  mkdirSync(join(dir, "workflows"));
  const workflow = join(dir, "workflows", "flow.toml");
  writeFileSync(
    workflow,
    `[workflow]\nname = "flow"\nversion = "0.1.0"\nschema = "runflow/1"\nstart = "${start}"\n\n${nodes}`,
  );
  return { dir, stateDir, workflow };
}

function go(f: Fixture, input?: unknown, env?: NodeJS.ProcessEnv): Promise<RunResult> {
  let inputPath: string | undefined;
  if (input !== undefined) {
    inputPath = join(f.dir, "input.json");
    writeFileSync(inputPath, JSON.stringify(input));
  }
  return runWorkflow({
    workflow: f.workflow,
    ...(inputPath === undefined ? {} : { input: inputPath }),
    stateDir: f.stateDir,
    clock,
    env: env ?? { PATH: process.env.PATH, HOME: f.dir },
  });
}

function events(f: Fixture): Event[] {
  return readFileSync(join(f.stateDir, "events.jsonl"), "utf8")
    .trimEnd()
    .split("\n")
    .map((line) => Event.parse(JSON.parse(line)));
}

const twoNodes = `
[nodes.a]
kind = "script"
run = "exit 10"
exit = { 0 = "ok", 10 = "vague", 1 = "invalid" }
on = { ok = "done", vague = "ask", invalid = "bad" }

[nodes.ask]
kind = "script"
run = "exit 0"
exit = { 0 = "ok" }
on = { ok = "asked" }

[nodes.done]
kind = "end"
outcome = "filed"

[nodes.asked]
kind = "end"
outcome = "clarified"

[nodes.bad]
kind = "end"
outcome = "failed"
`;

describe("exit maps and outcome edges", () => {
  it.each([
    [0, "filed", ["a"]],
    [10, "clarified", ["a", "ask"]],
    [1, "failed", ["a"]],
  ])("exit %i reaches the end node with outcome %s", async (code, outcome, trail) => {
    const f = fixture(twoNodes.replace('run = "exit 10"', `run = "exit ${code}"`));
    const result = await go(f);
    expect(result.status).toBe("ended");
    expect(result.outcome).toBe(outcome);
    const state = JSON.parse(readFileSync(join(result.runDir, "run.json"), "utf8")) as {
      trail: { node: string; exit: number }[];
      outcome: string;
    };
    expect(state.outcome).toBe(outcome);
    expect(state.trail.map((step) => step.node)).toEqual(trail);
    expect(state.trail[0]?.exit).toBe(code);
  });

  it("never retries a mapped exit code", async () => {
    const f = fixture(
      `[nodes.a]\nkind = "script"\nrun = "echo x >> \\"$DISCRETION_RUN_DIR/count\\"; exit 1"\nmax_attempts = 3\nexit = { 1 = "no" }\non = { no = "z" }\n\n[nodes.z]\nkind = "end"\noutcome = "no"\n`,
    );
    const result = await go(f);
    expect(result.outcome).toBe("no");
    expect(readFileSync(join(result.runDir, "count"), "utf8")).toBe("x\n");
  });
});

describe("the fixed environment", () => {
  it("sets the run variables and passes nothing else through", async () => {
    const f = fixture(
      `[nodes.a]\nkind = "script"\nrun = "env > \\"$DISCRETION_RUN_DIR/env.txt\\""\nexit = { 0 = "ok" }\non = { ok = "z" }\n\n[nodes.z]\nkind = "end"\noutcome = "ok"\n`,
    );
    const result = await runWorkflow({
      workflow: f.workflow,
      input: (() => {
        const p = join(f.dir, "input.json");
        writeFileSync(p, JSON.stringify({ capture_id: capture, text: "hi" }));
        return p;
      })(),
      stateDir: f.stateDir,
      clock,
      env: { PATH: process.env.PATH, HOME: f.dir, API_TOKEN: "hunter2" },
    });
    const env = Object.fromEntries(
      readFileSync(join(result.runDir, "env.txt"), "utf8")
        .trimEnd()
        .split("\n")
        .map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1)]),
    );
    expect(env.DISCRETION_RUN).toBe(result.runId);
    expect(env.DISCRETION_NODE).toBe("a");
    expect(env.DISCRETION_RUN_DIR).toBe(result.runDir);
    expect(env.DISCRETION_CAPTURE).toBe(capture);
    expect(env.DISCRETION_INPUT).toBe(join(result.runDir, "input.json"));
    expect(env.HOME).toBe(f.dir);
    expect(env.API_TOKEN).toBeUndefined();
  });

  it("gives the script a copy of the input and an empty object when there is none", async () => {
    const nodes = `[nodes.a]\nkind = "script"\nrun = "cat \\"$DISCRETION_INPUT\\""\nexit = { 0 = "ok" }\non = { ok = "z" }\n\n[nodes.z]\nkind = "end"\noutcome = "ok"\n`;
    const withInput = await go(fixture(nodes), { capture_id: capture, n: 2 });
    expect(JSON.parse(readFileSync(join(withInput.runDir, "input.json"), "utf8"))).toEqual({
      capture_id: capture,
      n: 2,
    });
    expect(readFileSync(join(withInput.runDir, "a.1.stdout"), "utf8")).toBe(
      readFileSync(join(withInput.runDir, "input.json"), "utf8"),
    );
    const without = await go(fixture(nodes));
    expect(JSON.parse(readFileSync(join(without.runDir, "input.json"), "utf8"))).toEqual({});
  });

  it("runs the script as a command line with its stdout and stderr kept", async () => {
    const f = fixture(
      `[nodes.a]\nkind = "script"\nrun = "echo '{\\"a\\":1}'; echo oops >&2"\nexit = { 0 = "ok" }\non = { ok = "z" }\n\n[nodes.z]\nkind = "end"\noutcome = "ok"\n`,
    );
    const result = await go(f);
    expect(readFileSync(join(result.runDir, "a.1.stdout"), "utf8")).toBe('{"a":1}\n');
    expect(readFileSync(join(result.runDir, "a.1.stderr"), "utf8")).toBe("oops\n");
  });
});

describe("the run directory", () => {
  it("is runs/<workflow>/<run id> under the state directory", async () => {
    const f = fixture(twoNodes);
    const result = await go(f);
    expect(result.runId).toMatch(/^run_20261113_[0-9a-hjkmnp-tv-z]{6}$/);
    expect(result.runDir).toBe(join(f.stateDir, "runs", "flow", result.runId));
    expect(existsSync(join(result.runDir, "run.json"))).toBe(true);
  });

  it("is new for every run", async () => {
    const f = fixture(twoNodes);
    const first = await go(f);
    const second = await go(f);
    expect(first.runDir).not.toBe(second.runDir);
  });
});

describe("timeouts", () => {
  it("defaults to 10 minutes", () => {
    expect(defaultTimeoutSeconds).toBe(600);
  });

  it("kills a node that overruns and fails the run with D6007", async () => {
    const f = fixture(
      `[nodes.a]\nkind = "script"\nrun = "sleep 30"\ntimeout = 1\nexit = { 0 = "ok" }\non = { ok = "z" }\n\n[nodes.z]\nkind = "end"\noutcome = "ok"\n`,
    );
    const started = Date.now();
    const result = await go(f);
    expect(Date.now() - started).toBeLessThan(10_000);
    expect(result.status).toBe("failed");
    expect(result.outcome).toBeUndefined();
    expect(result.error?.code).toBe("D6007");
    expect(result.error?.message).toMatch(/timed out after 1s/);
  });

  it("kills the whole process group", async () => {
    const f = fixture(
      `[nodes.a]\nkind = "script"\nrun = "(sleep 2; echo late > \\"$DISCRETION_RUN_DIR/late\\") & wait"\ntimeout = 1\nexit = { 0 = "ok" }\non = { ok = "z" }\n\n[nodes.z]\nkind = "end"\noutcome = "ok"\n`,
    );
    const result = await go(f);
    await new Promise((resolve) => setTimeout(resolve, 2500));
    expect(existsSync(join(result.runDir, "late"))).toBe(false);
  });
});

describe("bounded attempts", () => {
  const flaky = (attempts: number, succeedOn: number): string =>
    `[nodes.a]\nkind = "script"\nrun = "echo x >> \\"$DISCRETION_RUN_DIR/count\\"; [ \\"$(wc -l < \\"$DISCRETION_RUN_DIR/count\\")\\" -ge ${succeedOn} ]"\nmax_attempts = ${attempts}\nexit = { 0 = "ok" }\non = { ok = "z" }\n\n[nodes.z]\nkind = "end"\noutcome = "ok"\n`;

  it("stops at max_attempts and fails with D6007", async () => {
    const result = await go(fixture(flaky(3, 99)));
    expect(result.status).toBe("failed");
    expect(result.error?.code).toBe("D6007");
    expect(readFileSync(join(result.runDir, "count"), "utf8").trimEnd().split("\n")).toHaveLength(
      3,
    );
  });

  it("runs once when max_attempts is unset", async () => {
    const f = fixture(flaky(1, 99).replace("max_attempts = 1\n", ""));
    const result = await go(f);
    expect(readFileSync(join(result.runDir, "count"), "utf8")).toBe("x\n");
    expect(result.status).toBe("failed");
  });

  it("retries an unmapped exit code until one attempt maps", async () => {
    const result = await go(fixture(flaky(3, 2)));
    expect(result.status).toBe("ended");
    expect(result.outcome).toBe("ok");
    const state = JSON.parse(readFileSync(join(result.runDir, "run.json"), "utf8")) as {
      trail: { node: string; attempt: number; exit: number }[];
    };
    expect(state.trail.map((step) => [step.attempt, step.exit])).toEqual([
      [1, 1],
      [2, 0],
    ]);
    expect(existsSync(join(result.runDir, "a.2.stdout"))).toBe(true);
  });

  it("retries a node that times out", async () => {
    const f = fixture(
      `[nodes.a]\nkind = "script"\nrun = "echo x >> \\"$DISCRETION_RUN_DIR/count\\"; sleep 30"\ntimeout = 1\nmax_attempts = 2\nexit = { 0 = "ok" }\non = { ok = "z" }\n\n[nodes.z]\nkind = "end"\noutcome = "ok"\n`,
    );
    const result = await go(f);
    expect(result.status).toBe("failed");
    expect(readFileSync(join(result.runDir, "count"), "utf8")).toBe("x\nx\n");
  });

  it("fails when the command cannot run at all", async () => {
    const f = fixture(
      `[nodes.a]\nkind = "script"\nrun = "no-such-command-d0s7"\nexit = { 0 = "ok" }\non = { ok = "z" }\n\n[nodes.z]\nkind = "end"\noutcome = "ok"\n`,
    );
    const result = await go(f);
    expect(result.status).toBe("failed");
    expect(result.error?.code).toBe("D6007");
  });
});

describe("events and logs", () => {
  it("records run.started and run.ended with the run and capture ids", async () => {
    const f = fixture(twoNodes.replace('run = "exit 10"', 'run = "exit 0"'));
    const result = await go(f, { capture_id: capture });
    const [started, ended, ...rest] = events(f);
    expect(rest).toEqual([]);
    expect(started).toEqual({
      seq: 1,
      ts: "2026-11-13T15:45:00.000+05:30",
      type: "run.started",
      source: "runner",
      capture_id: capture,
      run_id: result.runId,
      data: { workflow: "flow", version: "0.1.0" },
    });
    expect(ended).toEqual({
      seq: 2,
      ts: "2026-11-13T15:45:00.000+05:30",
      type: "run.ended",
      source: "runner",
      capture_id: capture,
      run_id: result.runId,
      data: { workflow: "flow", status: "ended", outcome: "filed" },
    });
  });

  it("records run.ended with the error code when the run fails", async () => {
    const f = fixture(
      `[nodes.a]\nkind = "script"\nrun = "exit 7"\nexit = { 0 = "ok" }\non = { ok = "z" }\n\n[nodes.z]\nkind = "end"\noutcome = "ok"\n`,
    );
    const result = await go(f);
    const ended = events(f)[1];
    expect(ended?.type).toBe("run.ended");
    expect(ended?.run_id).toBe(result.runId);
    expect(ended?.capture_id).toBeUndefined();
    expect(ended?.data).toMatchObject({ workflow: "flow", status: "failed", error_code: "D6007" });
    expect(ended?.data.outcome).toBeUndefined();
  });

  it("writes log/1 lines tagged with the run id", async () => {
    const f = fixture(twoNodes);
    const result = await go(f);
    const lines = readFileSync(join(f.stateDir, "logs", "2026-11-13.jsonl"), "utf8")
      .trimEnd()
      .split("\n")
      .map((line) => JSON.parse(line) as { component: string; run_id: string });
    expect(lines.length).toBeGreaterThan(0);
    expect(lines.every((line) => line.component === "runner" && line.run_id === result.runId)).toBe(
      true,
    );
  });

  it("numbers events of concurrent runs without gaps", async () => {
    const f = fixture(twoNodes);
    await Promise.all([go(f), go(f), go(f)]);
    expect(events(f).map((event) => event.seq)).toEqual([1, 2, 3, 4, 5, 6]);
  });
});

describe("refusals", () => {
  async function refused(f: Fixture, input?: unknown): Promise<DiscretionError> {
    const error: unknown = await go(f, input).then(
      () => undefined,
      (caught: unknown) => caught,
    );
    expect(error).toBeInstanceOf(DiscretionError);
    return error as DiscretionError;
  }

  it("refuses a key runflow/1 does not allow, with D6005", async () => {
    const f = fixture(
      twoNodes.replace(
        'kind = "end"\noutcome = "filed"',
        'kind = "end"\noutcome = "filed"\nretries = 3',
      ),
    );
    expect((await refused(f)).code).toBe("D6005");
  });

  it("refuses a start node that does not exist", async () => {
    const error = await refused(fixture(twoNodes, "nowhere"));
    expect(error.code).toBe("D6005");
    expect(error.message).toMatch(/nowhere/);
  });

  it("refuses an edge to a node that does not exist", async () => {
    const error = await refused(fixture(twoNodes.replace('ok = "done"', 'ok = "gone"')));
    expect(error.code).toBe("D6005");
    expect(error.message).toMatch(/gone/);
  });

  it("refuses an exit outcome with no edge", async () => {
    const error = await refused(fixture(twoNodes.replace(', invalid = "bad"', "")));
    expect(error.code).toBe("D6005");
    expect(error.message).toMatch(/invalid/);
  });

  it("refuses an edge for an outcome the exit map never produces", async () => {
    const error = await refused(
      fixture(twoNodes.replace('invalid = "bad" }', 'invalid = "bad", extra = "bad" }')),
    );
    expect(error.code).toBe("D6005");
    expect(error.message).toMatch(/extra/);
  });

  it("refuses a workflow that is not valid TOML", async () => {
    const f = fixture(twoNodes);
    writeFileSync(f.workflow, "[workflow\n");
    expect((await refused(f)).code).toBe("D6005");
  });

  it("refuses a missing workflow file with D6006", async () => {
    const f = fixture(twoNodes);
    expect((await refused({ ...f, workflow: join(f.dir, "workflows", "none.toml") })).code).toBe(
      "D6006",
    );
  });

  it("refuses input that is not a JSON object, with D6008", async () => {
    const f = fixture(twoNodes);
    writeFileSync(join(f.dir, "input.json"), "[1]");
    const error = await runWorkflow({
      workflow: f.workflow,
      input: join(f.dir, "input.json"),
      stateDir: f.stateDir,
      clock,
    }).then(
      () => undefined,
      (caught: unknown) => caught as DiscretionError,
    );
    expect(error?.code).toBe("D6008");
  });

  it("refuses input whose capture_id is not a capture id", async () => {
    expect((await refused(fixture(twoNodes), { capture_id: "nope" })).code).toBe("D6008");
  });

  it("starts nothing when it refuses: no run directory and no events", async () => {
    const f = fixture(twoNodes, "nowhere");
    await refused(f);
    expect(existsSync(join(f.stateDir, "runs"))).toBe(false);
    expect(existsSync(join(f.stateDir, "events.jsonl"))).toBe(false);
  });
});

describe("loading and resolving", () => {
  it("loadRunflow returns the parsed file", () => {
    const f = fixture(twoNodes);
    const flow = loadRunflow(f.workflow);
    expect(flow.workflow.name).toBe("flow");
    expect(Object.keys(flow.nodes).sort()).toEqual(["a", "ask", "asked", "bad", "done"]);
  });

  it("resolves a bare name to workflows/<name>.toml and keeps paths", () => {
    expect(resolveWorkflow("capture-triage", "/repo")).toBe("/repo/workflows/capture-triage.toml");
    expect(resolveWorkflow("./x/y.toml", "/repo")).toBe("/repo/x/y.toml");
    expect(resolveWorkflow("/abs/y.toml", "/repo")).toBe("/abs/y.toml");
    expect(resolveWorkflow("flow.toml", "/repo")).toBe("/repo/flow.toml");
  });
});
