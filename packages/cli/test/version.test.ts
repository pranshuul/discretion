import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const bin = fileURLToPath(new URL("../bin/discretion.js", import.meta.url));
const manifest = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
) as { version: string; bin: Record<string, string> };

describe("discretion --version", () => {
  it("is installed as the discretion command", () => {
    expect(manifest.bin).toEqual({ discretion: "./bin/discretion.js" });
  });

  it("prints the package version and exits 0", () => {
    const out = execFileSync(process.execPath, [bin, "--version"], { encoding: "utf8" });
    expect(manifest.version).toMatch(/^\d+\.\d+\.\d+/);
    expect(out).toBe(`${manifest.version}\n`);
  });

  it("resolves through pnpm as `discretion`", () => {
    const result = spawnSync("pnpm", ["exec", "discretion", "--version"], {
      cwd: fileURLToPath(new URL("../../../", import.meta.url)),
      encoding: "utf8",
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toBe(`${manifest.version}\n`);
  });
});

describe("discretion without a known flag", () => {
  it.each([[[]], [["--bogus"]], [["bogus"]]])("prints usage to stderr and exits 2 for %j", (args) => {
    const result = spawnSync(process.execPath, [bin, ...args], { encoding: "utf8" });
    expect(result.status).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe("Usage: discretion --version\n");
  });
});
