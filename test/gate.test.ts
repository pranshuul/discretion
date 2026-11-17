import { spawnSync } from "node:child_process";
import { accessSync, constants } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = fileURLToPath(new URL("../", import.meta.url));
const gate = `${root}gates/d0.sh`;

function runGate(checks: string, harness: string): { status: number | null; lines: string[] } {
  const result = spawnSync("bash", [gate], {
    cwd: root,
    encoding: "utf8",
    env: { PATH: process.env.PATH, GATE_CHECKS: checks, GATE_HARNESS: harness },
  });
  return { status: result.status, lines: result.stdout.trimEnd().split("\n") };
}

describe("gates/d0.sh", () => {
  it("is executable", () => {
    expect(() => accessSync(gate, constants.X_OK)).not.toThrow();
  });

  it("prints PASS for the two automated bullets, SKIP 3 human, and exits 0", () => {
    const { status, lines } = runGate("true", "true");
    expect(lines).toEqual(["PASS 1", "PASS 2", "SKIP 3 human"]);
    expect(status).toBe(0);
  });

  it("fails bullet 1 with a reason when a check fails, still reports the rest, and exits 1", () => {
    const { status, lines } = runGate("exit 3", "true");
    expect(lines[0]).toMatch(/^FAIL 1 \S.*/);
    expect(lines.slice(1)).toEqual(["PASS 2", "SKIP 3 human"]);
    expect(status).toBe(1);
  });

  it("fails bullet 2 with a reason when the harness scenario fails, and exits 1", () => {
    const { status, lines } = runGate("true", "exit 4");
    expect(lines[0]).toBe("PASS 1");
    expect(lines[1]).toMatch(/^FAIL 2 \S.*/);
    expect(lines[2]).toBe("SKIP 3 human");
    expect(status).toBe(1);
  });

  it("fails both bullets when both fail", () => {
    const { status, lines } = runGate("false", "false");
    expect(lines.map((line) => line.split(" ").slice(0, 2).join(" "))).toEqual([
      "FAIL 1",
      "FAIL 2",
      "SKIP 3",
    ]);
    expect(status).toBe(1);
  });
});
