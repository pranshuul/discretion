import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Action } from "@discretion/model";
import { describe, expect, it } from "vitest";
import { ActionLog } from "../src/actionlog.js";
import type { Clock } from "../src/clock.js";
import { scratch } from "./helpers.js";

const clock: Clock = { now: () => new Date("2026-11-13T10:15:00Z") };
const sha = "a".repeat(64);

function read(path: string): Action[] {
  return readFileSync(path, "utf8")
    .trimEnd()
    .split("\n")
    .map((line) => Action.parse(JSON.parse(line)));
}

describe("action log", () => {
  it("gives each action its id and timestamp and appends it as an action/1 line", () => {
    const path = join(scratch(), "state", "actions.jsonl");
    const log = new ActionLog(path, clock);
    const written = log.append({
      capture_id: "cap_20261113_abc234",
      type: "note.section.write",
      target: "1-Roots/2026-11-13.md",
      before_sha256: sha,
      after_sha256: "b".repeat(64),
      inverse: { patch: "@@ -1 +1 @@" },
      floor: false,
    });
    expect(written.id).toMatch(/^act_20261113_[0-9a-hjkmnp-tv-z]{6}$/);
    expect(written.ts).toBe("2026-11-13T15:45:00.000+05:30");
    expect(read(path)).toEqual([written]);
  });

  it("appends in order and keeps ids distinct", () => {
    const path = join(scratch(), "actions.jsonl");
    const log = new ActionLog(path, clock);
    const ids = Array.from(
      { length: 50 },
      () => log.append({ type: "review.add", target: "rev_1", inverse: {}, floor: false }).id,
    );
    expect(new Set(ids).size).toBe(50);
    expect(read(path).map((a) => a.id)).toEqual(ids);
  });

  it("records the confirmation of an action under the floor", () => {
    const path = join(scratch(), "actions.jsonl");
    const written = new ActionLog(path, clock).append({
      type: "mail.send",
      target: "msg-1",
      inverse: {},
      floor: true,
      confirmed_by: "rev_20261113_abc234",
    });
    expect(written).toMatchObject({ floor: true, confirmed_by: "rev_20261113_abc234" });
  });

  it("refuses an action under the floor without its confirmation, and writes nothing", () => {
    const path = join(scratch(), "actions.jsonl");
    const log = new ActionLog(path, clock);
    expect(() =>
      log.append({ type: "mail.send", target: "m", inverse: {}, floor: true } as never),
    ).toThrow();
    expect(() =>
      log.append({ type: "mail.send", target: "m", inverse: {}, floor: false } as never),
    ).toThrow();
    expect(() =>
      log.append({ type: "nope", target: "m", inverse: {}, floor: false } as never),
    ).toThrow();
    log.append({ type: "review.add", target: "r", inverse: {}, floor: false });
    expect(read(path)).toHaveLength(1);
  });

  it("writes sorted keys", () => {
    const path = join(scratch(), "actions.jsonl");
    new ActionLog(path, clock).append({
      type: "review.add",
      target: "r",
      inverse: { z: 1, a: 2 },
      floor: false,
    });
    const line = readFileSync(path, "utf8");
    expect(line).toMatch(
      /^\{"floor":false,"id":"act_20261113_\w{6}","inverse":\{"a":2,"z":1\},"target":"r","ts":"[^"]+","type":"review.add"\}\n$/,
    );
  });
});
