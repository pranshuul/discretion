import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import {
  DiscretionError,
  resolveWorkflow,
  runWorkflow,
  stableStringify,
  systemClock,
} from "@discretion/core";

const usage = "Usage: discretion --version\n";
const runUsage = "Usage: discretion run <workflow> [--input <file>]\n";

interface Output {
  write(text: string): unknown;
}

export function version(): string {
  const manifest = JSON.parse(
    readFileSync(new URL("../package.json", import.meta.url), "utf8"),
  ) as { version: string };
  return manifest.version;
}

/** `discretion run <workflow> [--input <file>]`: 0 when an end node is reached, 1 otherwise. */
async function runCommand(argv: string[], stdout: Output, stderr: Output): Promise<number> {
  let positionals: string[];
  let input: string | undefined;
  try {
    const parsed = parseArgs({
      args: argv,
      options: { input: { type: "string" } },
      allowPositionals: true,
    });
    positionals = parsed.positionals;
    input = parsed.values.input;
  } catch {
    stderr.write(runUsage);
    return 2;
  }
  const [name] = positionals;
  if (name === undefined || positionals.length !== 1) {
    stderr.write(runUsage);
    return 2;
  }
  const cwd = process.cwd();
  try {
    const result = await runWorkflow({
      workflow: resolveWorkflow(name, cwd),
      ...(input === undefined ? {} : { input: resolve(cwd, input) }),
      stateDir: join(homedir(), ".local", "state", "discretion"),
      clock: systemClock,
    });
    stdout.write(
      `${stableStringify({
        outcome: result.outcome,
        run_dir: result.runDir,
        run_id: result.runId,
        status: result.status,
      })}\n`,
    );
    if (result.error !== undefined) {
      stderr.write(`${result.error.format()}\n`);
      return 1;
    }
    return 0;
  } catch (error) {
    if (error instanceof DiscretionError) {
      stderr.write(`${error.format()}\n`);
      return 1;
    }
    throw error;
  }
}

/** Runs the `discretion` command and returns its exit code. */
export async function run(argv: string[], stdout: Output, stderr: Output): Promise<number> {
  if (argv[0] === "run") {
    return runCommand(argv.slice(1), stdout, stderr);
  }
  let showVersion: boolean;
  try {
    const { values } = parseArgs({ args: argv, options: { version: { type: "boolean" } } });
    showVersion = values.version === true;
  } catch {
    showVersion = false;
  }
  if (!showVersion) {
    stderr.write(usage);
    return 2;
  }
  stdout.write(`${version()}\n`);
  return 0;
}
