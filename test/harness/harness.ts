import type { RunResult } from "@discretion/core";
import { FakeClock } from "./clock.js";
import { FakeModelServer, type Scenario } from "./models.js";
import { FakeTelegram } from "./telegram.js";

export interface Harness {
  clock: FakeClock;
  telegram: FakeTelegram;
  models: FakeModelServer;
  /** A scratch directory removed by `close`. */
  dir: string;
  /** The runner's state directory inside `dir`. */
  stateDir: string;
  /** Runs a `runflow/1` file through the node runner with the fake clock. */
  run(options: { workflow: string; input?: string }): Promise<RunResult>;
  close(): Promise<void>;
}

export function startHarness(options: {
  scenario: Scenario | string;
  now?: string;
}): Promise<Harness> {
  void options;
  throw new Error("red");
}
