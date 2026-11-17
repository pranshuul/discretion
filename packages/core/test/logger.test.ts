import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Log } from "@discretion/model";
import { describe, expect, it } from "vitest";
import type { Clock } from "../src/clock.js";
import { loadConfig } from "../src/config.js";
import { DiscretionError } from "../src/errors.js";
import { Logger } from "../src/logger.js";
import { fakeSops, scratch } from "./helpers.js";

function fixed(iso: string): Clock & { set(iso: string): void } {
  let current = new Date(iso);
  return {
    now: () => current,
    set(next: string) {
      current = new Date(next);
    },
  };
}

function lines(dir: string, file: string): Record<string, unknown>[] {
  return readFileSync(join(dir, file), "utf8")
    .trimEnd()
    .split("\n")
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

describe("logger", () => {
  it("writes log/1 lines to the day's file", () => {
    const dir = scratch();
    const logger = new Logger({
      dir,
      component: "core",
      clock: fixed("2026-11-13T10:15:00Z"),
    });
    logger.info("config loaded");
    logger.debug("d");
    logger.warn("w");
    logger.error("e");
    expect(readdirSync(dir)).toEqual(["2026-11-13.jsonl"]);
    const written = lines(dir, "2026-11-13.jsonl");
    expect(written.map((l) => l["level"])).toEqual(["info", "debug", "warn", "error"]);
    for (const line of written) {
      expect(Log.safeParse(line).success).toBe(true);
    }
    expect(written[0]).toEqual({
      ts: "2026-11-13T15:45:00.000+05:30",
      level: "info",
      component: "core",
      msg: "config loaded",
    });
  });

  it("creates the directory and appends to an existing file", () => {
    const dir = join(scratch(), "state", "logs");
    const clock = fixed("2026-11-13T10:15:00Z");
    new Logger({ dir, component: "a", clock }).info("one");
    new Logger({ dir, component: "b", clock }).info("two");
    expect(lines(dir, "2026-11-13.jsonl").map((l) => l["msg"])).toEqual(["one", "two"]);
  });

  it("rotates at Kolkata midnight", () => {
    const dir = scratch();
    const clock = fixed("2026-11-13T18:29:59Z");
    const logger = new Logger({ dir, component: "core", clock });
    logger.info("before");
    clock.set("2026-11-13T18:30:00Z");
    logger.info("after");
    expect(readdirSync(dir).sort()).toEqual(["2026-11-13.jsonl", "2026-11-14.jsonl"]);
  });

  it("carries the capture, the run and the fields", () => {
    const dir = scratch();
    const logger = new Logger({ dir, component: "core", clock: fixed("2026-11-13T10:15:00Z") });
    logger.info("filed", {
      capture_id: "cap_20261113_abc234",
      run_id: "run_20261113_a1b2c3",
      fields: { attempt: 2 },
    });
    expect(lines(dir, "2026-11-13.jsonl")[0]).toMatchObject({
      capture_id: "cap_20261113_abc234",
      run_id: "run_20261113_a1b2c3",
      fields: { attempt: 2 },
    });
  });

  it("takes error_code from a typed error and logs its remedy", () => {
    const dir = scratch();
    const logger = new Logger({ dir, component: "core", clock: fixed("2026-11-13T10:15:00Z") });
    logger.error("refused", { error: new DiscretionError("D6001", "Unknown key.", "Remove it.") });
    const line = lines(dir, "2026-11-13.jsonl")[0];
    expect(line).toMatchObject({ level: "error", error_code: "D6001" });
    expect(Log.safeParse(line).success).toBe(true);
    expect(JSON.stringify(line)).toContain("Remove it.");
  });

  it("logs an untyped error's message without an error_code", () => {
    const dir = scratch();
    const logger = new Logger({ dir, component: "core", clock: fixed("2026-11-13T10:15:00Z") });
    logger.error("crashed", { error: new Error("boom") });
    const line = lines(dir, "2026-11-13.jsonl")[0];
    expect(line?.["error_code"]).toBeUndefined();
    expect(JSON.stringify(line)).toContain("boom");
  });

  it("writes keys in sorted order", () => {
    const dir = scratch();
    const logger = new Logger({ dir, component: "core", clock: fixed("2026-11-13T10:15:00Z") });
    logger.info("m", { fields: { z: 1, a: 2 } });
    expect(readFileSync(join(dir, "2026-11-13.jsonl"), "utf8")).toBe(
      '{"component":"core","fields":{"a":2,"z":1},"level":"info","msg":"m","ts":"2026-11-13T15:45:00.000+05:30"}\n',
    );
  });

  it("refuses a line that is not log/1", () => {
    const dir = scratch();
    const logger = new Logger({ dir, component: "core", clock: fixed("2026-11-13T10:15:00Z") });
    expect(() => logger.info("m", { capture_id: "not-an-id" })).toThrow();
    expect(readdirSync(dir)).toEqual([]);
  });

  it("scrubs secret values from messages, fields and errors", () => {
    const dir = scratch();
    const logger = new Logger({
      dir,
      component: "core",
      clock: fixed("2026-11-13T10:15:00Z"),
      secrets: ['tok"en\\1234', "plain-secret-5678"],
    });
    logger.info('sent with tok"en\\1234', {
      fields: { header: "Bearer plain-secret-5678", nested: ['tok"en\\1234'] },
      error: new Error("failed using plain-secret-5678"),
    });
    const text = readFileSync(join(dir, "2026-11-13.jsonl"), "utf8");
    expect(text).not.toContain("plain-secret-5678");
    expect(text).not.toContain("1234");
    expect(text).not.toContain('tok\\"en');
    expect(text).toContain("[redacted]");
    expect(Log.safeParse(JSON.parse(text)).success).toBe(true);
  });

  it("never lets a loaded config's secret value reach a line", async () => {
    const dir = scratch();
    const sops = fakeSops(JSON.stringify({ RELAY_TOKEN: "relay-token-2222" }));
    const path = join(scratch(), "discretion.toml");
    writeFileSync(path, 'schema = "config/1"\n[relay]\ntoken = "secret:RELAY_TOKEN"\n');
    const { config, secrets } = await loadConfig(path, { env: sops.env });
    const logger = new Logger({
      dir,
      component: "core",
      clock: fixed("2026-11-13T10:15:00Z"),
      secrets,
    });
    logger.info("relay configured", { fields: { relay: config.relay } });
    const text = readFileSync(join(dir, "2026-11-13.jsonl"), "utf8");
    expect(text).not.toContain("relay-token-2222");
    expect(text).toContain("[redacted]");
  });

  it("ignores an empty secret", () => {
    const dir = scratch();
    const logger = new Logger({
      dir,
      component: "core",
      clock: fixed("2026-11-13T10:15:00Z"),
      secrets: [""],
    });
    logger.info("hello");
    expect(lines(dir, "2026-11-13.jsonl")[0]?.["msg"]).toBe("hello");
  });
});
