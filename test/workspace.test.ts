import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = fileURLToPath(new URL("../", import.meta.url));

function read(path: string): string {
  return readFileSync(`${root}${path}`, "utf8");
}

function readJson(path: string): Record<string, unknown> {
  return JSON.parse(read(path)) as Record<string, unknown>;
}

// Every package in the build plan's Architecture table.
const packages = [
  "packages/model",
  "packages/core",
  "packages/cli",
  "packages/roots",
  "packages/mcp",
  "packages/models-client",
  "packages/capture",
  "services/bot",
  "services/relay",
  "services/clock",
  "services/subscribers",
  "packages/planner",
  "packages/tracker",
  "apps/widget",
  "packages/mycelium",
  "services/watchers",
  "packages/reels",
  "apps/dashboard",
  "packages/learning",
  "installer",
];

describe("toolchain pins", () => {
  it("pins Node 22 through .nvmrc", () => {
    expect(read(".nvmrc").trim()).toBe("22");
  });

  it("pins Node 22 through engines.node", () => {
    const engines = readJson("package.json").engines as Record<string, string>;
    expect(engines.node).toBe("^22");
  });

  it("pins Node 22 through mise.toml", () => {
    expect(read("mise.toml")).toMatch(/^\[tools\]\nnode = "22"$/m);
  });

  it("pins pnpm to an exact version through packageManager", () => {
    expect(readJson("package.json").packageManager).toMatch(/^pnpm@\d+\.\d+\.\d+$/);
  });
});

describe("workspace", () => {
  it("defines the fixed check commands", () => {
    const scripts = readJson("package.json").scripts as Record<string, string>;
    for (const name of ["lint", "typecheck", "test", "schemas:check", "build"]) {
      expect(scripts[name], name).toEqual(expect.any(String));
    }
  });

  it("compiles TypeScript in strict mode", () => {
    const base = readJson("tsconfig.base.json");
    const options = base.compilerOptions as Record<string, unknown>;
    expect(options.strict).toBe(true);
  });

  it("has ESLint and Prettier configuration", () => {
    expect(existsSync(`${root}eslint.config.js`)).toBe(true);
    expect(existsSync(`${root}.prettierrc.json`)).toBe(true);
  });

  it.each(packages)("has the package %s", (dir) => {
    const manifest = readJson(`${dir}/package.json`);
    const leaf = dir.split("/").at(-1);
    expect(manifest.name).toBe(`@discretion/${leaf}`);
    expect(manifest.private).toBe(true);
  });

  it("lists every package in the pnpm workspace", () => {
    const workspace = read("pnpm-workspace.yaml");
    for (const pattern of ["packages/*", "services/*", "apps/*", "installer"]) {
      expect(workspace).toContain(`- ${pattern}\n`);
    }
  });
});
