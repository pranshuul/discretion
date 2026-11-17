import { describe, expect, it } from "vitest";
import { Event } from "../src/index.js";

function sample(): Record<string, unknown> {
  return {
    seq: 1,
    ts: "2026-11-13T10:15:00+05:30",
    type: "run.started",
    source: "core",
    data: { workflow: "capture-triage" },
  };
}

describe("event/1", () => {
  it("accepts a line with every required field", () => {
    expect(Event.safeParse(sample()).success).toBe(true);
  });

  it("accepts the optional capture and run ids", () => {
    const line = { ...sample(), capture_id: "cap_20261105_x2b8pd", run_id: "run_20261113_a1b2c3" };
    expect(Event.safeParse(line).success).toBe(true);
  });

  it.each(["seq", "ts", "type", "source", "data"])("refuses a line without %s", (field) => {
    const line = sample();
    Reflect.deleteProperty(line, field);
    expect(Event.safeParse(line).success).toBe(false);
  });

  it.each([0, -1, 1.5, "1"])("refuses seq %j, which is not an integer from 1", (seq) => {
    expect(Event.safeParse({ ...sample(), seq }).success).toBe(false);
  });

  it.each(["2026-11-13T10:15:00", "2026-11-13", "10:15", 1794545100])(
    "refuses ts %j, which is not RFC 3339 with an offset",
    (ts) => {
      expect(Event.safeParse({ ...sample(), ts }).success).toBe(false);
    },
  );

  it("accepts a UTC ts", () => {
    expect(Event.safeParse({ ...sample(), ts: "2026-11-13T04:45:00Z" }).success).toBe(true);
  });

  it.each(["capture.received", "vault.committed", "run.ended", "plugin.custom"])(
    "accepts the type %s",
    (type) => {
      expect(Event.safeParse({ ...sample(), type }).success).toBe(true);
    },
  );

  it.each<[string, unknown]>([
    ["type", 1],
    ["source", 1],
    ["data", "text"],
    ["data", [1]],
    ["data", null],
    ["capture_id", "x2b8pd"],
    ["capture_id", "act_20261105_x2b8pd"],
    ["capture_id", "cap_2026115_x2b8pd"],
    ["capture_id", "cap_20261105_X2B8PD"],
    ["capture_id", "cap_20261105_x2b8pd7"],
    ["run_id", 7],
  ])("refuses %s set to %j", (field, value) => {
    expect(Event.safeParse({ ...sample(), [field]: value }).success).toBe(false);
  });

  it("refuses an unknown field", () => {
    expect(Event.safeParse({ ...sample(), surprise: 1 }).success).toBe(false);
  });
});
