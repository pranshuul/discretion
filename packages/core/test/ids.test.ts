import { Event } from "@discretion/model";
import { describe, expect, it } from "vitest";
import type { Clock } from "../src/clock.js";
import { idPrefixes, newId, type IdPrefix } from "../src/ids.js";

const clock: Clock = { now: () => new Date("2026-11-05T10:00:00Z") };

describe("ids", () => {
  it("has the plan's prefixes", () => {
    expect([...idPrefixes].sort()).toEqual(
      ["act", "cap", "crd", "gol", "rem", "rev", "run", "sub", "tap", "tsk", "viw"].sort(),
    );
  });

  it.each(idPrefixes)("generates <%s>_<YYYYMMDD>_<6 base32>", (prefix) => {
    expect(newId(prefix, clock)).toMatch(new RegExp(`^${prefix}_20261105_[0-9a-hjkmnp-tv-z]{6}$`));
  });

  it("generates ids the model accepts", () => {
    const capture_id = newId("cap", clock);
    expect(
      Event.safeParse({
        seq: 1,
        ts: "2026-11-05T15:30:00+05:30",
        type: "t",
        source: "s",
        capture_id,
        data: {},
      }).success,
    ).toBe(true);
  });

  it("dates the id by the Kolkata day", () => {
    const late: Clock = { now: () => new Date("2026-11-05T19:00:00Z") };
    expect(newId("act", late)).toMatch(/^act_20261106_/);
  });

  it("maps each random byte onto the alphabet by its low five bits", () => {
    const bytes = (length: number) => Uint8Array.from({ length }, (_, i) => i * 7 + 1);
    // bytes 1, 8, 15, 22, 29, 36 index "0123456789abcdefghjkmnpqrstvwxyz"
    expect(newId("tsk", clock, bytes)).toBe("tsk_20261105_18fpx4");
  });

  it("does not repeat", () => {
    const seen = new Set(Array.from({ length: 500 }, () => newId("run", clock)));
    expect(seen.size).toBe(500);
  });

  it("refuses a prefix the plan does not define", () => {
    expect(() => newId("zzz" as IdPrefix, clock)).toThrow(/prefix/);
  });
});
