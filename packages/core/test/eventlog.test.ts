import { spawn } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Event } from "@discretion/model";
import { describe, expect, it } from "vitest";
import type { Clock } from "../src/clock.js";
import { EventLog } from "../src/eventlog.js";
import { scratch } from "./helpers.js";

const clock: Clock = { now: () => new Date("2026-11-13T10:15:00Z") };

function read(path: string): Event[] {
  return readFileSync(path, "utf8")
    .trimEnd()
    .split("\n")
    .map((line) => Event.parse(JSON.parse(line)));
}

describe("event log", () => {
  it("numbers events from 1 without gaps and returns what it wrote", () => {
    const path = join(scratch(), "state", "events.jsonl");
    const log = new EventLog(path, clock);
    const first = log.append({ type: "capture.received", source: "bot", data: { n: 1 } });
    const second = log.append({
      type: "capture.filed",
      source: "capture",
      capture_id: "cap_20261113_abc234",
      run_id: "run_20261113_a1b2c3",
      data: {},
    });
    expect(first).toEqual({
      seq: 1,
      ts: "2026-11-13T15:45:00.000+05:30",
      type: "capture.received",
      source: "bot",
      data: { n: 1 },
    });
    expect(second.seq).toBe(2);
    expect(read(path)).toEqual([first, second]);
  });

  it("continues after the last line, also from another instance", () => {
    const path = join(scratch(), "events.jsonl");
    new EventLog(path, clock).append({ type: "a", source: "s", data: {} });
    new EventLog(path, clock).append({ type: "b", source: "s", data: {} });
    const third = new EventLog(path, clock).append({ type: "c", source: "s", data: {} });
    expect(third.seq).toBe(3);
    expect(read(path).map((e) => e.seq)).toEqual([1, 2, 3]);
  });

  it("finds the last seq in a file with long lines", () => {
    const path = join(scratch(), "events.jsonl");
    const log = new EventLog(path, clock);
    log.append({ type: "a", source: "s", data: { blob: "x".repeat(100_000) } });
    log.append({ type: "b", source: "s", data: { blob: "y".repeat(100_000) } });
    expect(log.append({ type: "c", source: "s", data: {} }).seq).toBe(3);
  });

  it("writes sorted keys, one line per event", () => {
    const path = join(scratch(), "events.jsonl");
    new EventLog(path, clock).append({ type: "a", source: "s", data: { z: 1, a: 2 } });
    expect(readFileSync(path, "utf8")).toBe(
      '{"data":{"a":2,"z":1},"seq":1,"source":"s","ts":"2026-11-13T15:45:00.000+05:30","type":"a"}\n',
    );
  });

  it("refuses an event that is not event/1 and writes nothing", () => {
    const path = join(scratch(), "events.jsonl");
    const log = new EventLog(path, clock);
    expect(() => log.append({ type: "a", source: "s", capture_id: "bad", data: {} })).toThrow();
    expect(existsSync(path) ? readFileSync(path, "utf8") : "").toBe("");
    expect(log.append({ type: "a", source: "s", data: {} }).seq).toBe(1);
  });

  it("recovers a lock left by a process that is gone", () => {
    const dir = scratch();
    const path = join(dir, "events.jsonl");
    writeFileSync(`${path}.lock`, "2147483646\n");
    expect(new EventLog(path, clock).append({ type: "a", source: "s", data: {} }).seq).toBe(1);
  });

  it("leaves no lock behind", () => {
    const path = join(scratch(), "events.jsonl");
    new EventLog(path, clock).append({ type: "a", source: "s", data: {} });
    expect(existsSync(`${path}.lock`)).toBe(false);
  });

  it("keeps seq gapless across concurrent appends from several processes", async () => {
    const path = join(scratch(), "events.jsonl");
    const dist = fileURLToPath(new URL("../dist/index.js", import.meta.url));
    const script = `
      const { EventLog, systemClock } = await import(process.argv[1]);
      const log = new EventLog(process.argv[2], systemClock);
      for (let i = 0; i < 40; i++) log.append({ type: "t", source: process.argv[3], data: { i } });
    `;
    const workers = Array.from(
      { length: 5 },
      (_, n) =>
        new Promise<number | null>((resolve) => {
          spawn(process.execPath, ["--input-type=module", "-e", script, dist, path, `w${n}`], {
            stdio: "inherit",
          }).on("exit", resolve);
        }),
    );
    expect(await Promise.all(workers)).toEqual([0, 0, 0, 0, 0]);
    const events = read(path);
    expect(events.map((e) => e.seq)).toEqual(Array.from({ length: 200 }, (_, i) => i + 1));
    for (let n = 0; n < 5; n++) {
      expect(events.filter((e) => e.source === `w${n}`)).toHaveLength(40);
    }
  }, 60_000);
});
