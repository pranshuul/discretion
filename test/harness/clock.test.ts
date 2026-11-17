import { timestamp, today } from "@discretion/core";
import { describe, expect, it } from "vitest";
import { FakeClock } from "./clock.js";

describe("FakeClock", () => {
  it("starts at the given instant, from a string or a Date", () => {
    expect(new FakeClock("2026-11-02T03:30:00Z").now().toISOString()).toBe(
      "2026-11-02T03:30:00.000Z",
    );
    expect(new FakeClock(new Date("2026-11-03T00:00:00Z")).now().toISOString()).toBe(
      "2026-11-03T00:00:00.000Z",
    );
  });

  it("does not move on its own", async () => {
    const clock = new FakeClock("2026-11-02T03:30:00Z");
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(clock.now().toISOString()).toBe("2026-11-02T03:30:00.000Z");
  });

  it("hands out copies, so a caller cannot move it", () => {
    const clock = new FakeClock("2026-11-02T03:30:00Z");
    clock.now().setUTCFullYear(1999);
    expect(clock.now().toISOString()).toBe("2026-11-02T03:30:00.000Z");
  });

  it("advances by milliseconds", () => {
    const clock = new FakeClock("2026-11-02T03:30:00Z");
    clock.advance(300_000);
    expect(clock.now().toISOString()).toBe("2026-11-02T03:35:00.000Z");
    clock.advance(0);
    expect(clock.now().toISOString()).toBe("2026-11-02T03:35:00.000Z");
  });

  it("refuses to go backwards by advancing", () => {
    const clock = new FakeClock("2026-11-02T03:30:00Z");
    expect(() => clock.advance(-1)).toThrow();
    expect(() => clock.advance(Number.NaN)).toThrow();
  });

  it("jumps with set, backwards included", () => {
    const clock = new FakeClock("2026-11-02T03:30:00Z");
    clock.set("2026-11-08T18:30:00Z");
    expect(clock.now().toISOString()).toBe("2026-11-08T18:30:00.000Z");
    clock.set(new Date("2026-01-01T00:00:00Z"));
    expect(clock.now().toISOString()).toBe("2026-01-01T00:00:00.000Z");
  });

  it("refuses an unreadable instant", () => {
    expect(() => new FakeClock("not a date")).toThrow();
    expect(() => new FakeClock("2026-11-02T03:30:00Z").set("nope")).toThrow();
  });

  it("is a core Clock, read in Asia/Kolkata", () => {
    const clock = new FakeClock("2026-11-01T18:30:00Z");
    expect(today(clock)).toBe("2026-11-02");
    clock.advance(1500);
    expect(timestamp(clock)).toBe("2026-11-02T00:00:01.500+05:30");
  });
});
