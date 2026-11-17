import { runWorkflow, type RunResult } from "@discretion/core";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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

/** Starts the fakes on one clock; `now` defaults to 2026-11-02 09:00 Asia/Kolkata. */
export async function startHarness(options: {
  scenario: Scenario | string;
  now?: string;
}): Promise<Harness> {
  const clock = new FakeClock(options.now ?? "2026-11-02T03:30:00Z");
  const dir = mkdtempSync(join(tmpdir(), "discretion-harness-run-"));
  const stateDir = join(dir, "state");
  mkdirSync(stateDir);
  const telegram = await FakeTelegram.start({ clock });
  let models: FakeModelServer;
  try {
    models = await FakeModelServer.start(options.scenario, { clock });
  } catch (error) {
    await telegram.close();
    rmSync(dir, { recursive: true, force: true });
    throw error;
  }
  return {
    clock,
    telegram,
    models,
    dir,
    stateDir,
    run: ({ workflow, input }) =>
      runWorkflow({ workflow, ...(input === undefined ? {} : { input }), stateDir, clock }),
    async close() {
      await Promise.all([telegram.close(), models.close()]);
      rmSync(dir, { recursive: true, force: true });
    },
  };
}
