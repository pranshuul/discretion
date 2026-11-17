import type { Runflow } from "@discretion/model";
import type { Clock } from "./clock.js";
import type { DiscretionError } from "./errors.js";

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

/** Reads and validates a `runflow/1` file. */
export const loadRunflow: (path: string) => Runflow = () => {
  throw new Error("red");
};

/** A path stays as given; a bare name becomes `<cwd>/workflows/<name>.toml`. */
export const resolveWorkflow: (name: string, cwd: string) => string = () => {
  throw new Error("red");
};

/** Executes a workflow to an end node, or until a node fails for good. */
export const runWorkflow: (options: RunOptions) => Promise<RunResult> = () => {
  throw new Error("red");
};
