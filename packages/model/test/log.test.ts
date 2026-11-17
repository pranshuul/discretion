import { describe, expect, it } from "vitest";
import { Log } from "../src/index.js";

function sample(): Record<string, unknown> {
  return {
    ts: "2026-11-13T10:15:00+05:30",
    level: "info",
    component: "core",
    msg: "config loaded",
  };
}

describe("log/1", () => {
  it("accepts a line with every required field", () => {
    expect(Log.safeParse(sample()).success).toBe(true);
  });

  it("accepts every optional field", () => {
    const line = {
      ...sample(),
      level: "error",
      capture_id: "cap_20261105_x2b8pd",
      run_id: "run_20261113_a1b2c3",
      error_code: "D6001",
      fields: { key: "telegram.surprise", attempt: 2 },
    };
    expect(Log.safeParse(line).success).toBe(true);
  });

  it.each(["debug", "info", "warn", "error"])("accepts the level %s", (level) => {
    expect(Log.safeParse({ ...sample(), level }).success).toBe(true);
  });

  it.each(["trace", "fatal", "INFO", 3])("refuses the level %j", (level) => {
    expect(Log.safeParse({ ...sample(), level }).success).toBe(false);
  });

  it.each(["ts", "level", "component", "msg"])("refuses a line without %s", (field) => {
    const line = sample();
    Reflect.deleteProperty(line, field);
    expect(Log.safeParse(line).success).toBe(false);
  });

  it.each(["D1003", "D2014", "D3005", "D4000", "D5999", "D6001", "D7001"])(
    "accepts the error code %s",
    (error_code) => {
      expect(Log.safeParse({ ...sample(), error_code }).success).toBe(true);
    },
  );

  it.each(["D0001", "D8001", "D600", "D60011", "E2001", "d6001", 6001])(
    "refuses the error code %j",
    (error_code) => {
      expect(Log.safeParse({ ...sample(), error_code }).success).toBe(false);
    },
  );

  it.each<[string, unknown]>([
    ["ts", "2026-11-13T10:15:00"],
    ["component", 1],
    ["msg", { text: "x" }],
    ["capture_id", "cap_x"],
    ["run_id", 1],
    ["fields", "a=b"],
    ["fields", [1]],
    ["fields", null],
  ])("refuses %s set to %j", (field, value) => {
    expect(Log.safeParse({ ...sample(), [field]: value }).success).toBe(false);
  });

  it("refuses an unknown field", () => {
    expect(Log.safeParse({ ...sample(), surprise: 1 }).success).toBe(false);
  });
});
