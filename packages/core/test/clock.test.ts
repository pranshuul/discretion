import { Log } from "@discretion/model";
import { describe, expect, it } from "vitest";
import { systemClock, timestamp, today, type Clock } from "../src/clock.js";

const at = (iso: string): Clock => ({ now: () => new Date(iso) });

describe("clock", () => {
  it("renders RFC 3339 in Asia/Kolkata", () => {
    expect(timestamp(at("2026-11-13T10:15:00.250Z"))).toBe("2026-11-13T15:45:00.250+05:30");
  });

  it("renders timestamps the model accepts", () => {
    const ts = timestamp(at("2026-01-01T00:00:00Z"));
    expect(Log.safeParse({ ts, level: "info", component: "c", msg: "m" }).success).toBe(true);
  });

  it("reads the date in Kolkata, not UTC", () => {
    expect(today(at("2026-11-13T18:29:59Z"))).toBe("2026-11-13");
    expect(today(at("2026-11-13T18:30:00Z"))).toBe("2026-11-14");
  });

  it("rolls the year over at Kolkata midnight", () => {
    expect(timestamp(at("2026-12-31T18:30:00Z"))).toBe("2027-01-01T00:00:00.000+05:30");
    expect(today(at("2026-12-31T18:30:00Z"))).toBe("2027-01-01");
  });

  it("reads the real time from the system clock", () => {
    const before = Date.now();
    const read = systemClock.now().getTime();
    expect(read).toBeGreaterThanOrEqual(before);
    expect(read).toBeLessThanOrEqual(Date.now());
  });
});
