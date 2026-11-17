import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const bin = fileURLToPath(new URL("../bin/discretion.js", import.meta.url));
const made: string[] = [];

afterEach(() => {
  for (const dir of made.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function home(): string {
  const dir = mkdtempSync(join(tmpdir(), "discretion-cli-"));
  made.push(dir);
  mkdirSync(join(dir, "workflows"));
  return dir;
}

function workflow(dir: string, body: string): void {
  writeFileSync(
    join(dir, "workflows", "demo.toml"),
    `[workflow]\nname = "demo"\nversion = "0.1.0"\nschema = "runflow/1"\nstart = "a"\n\n${body}`,
  );
}

const ok = `[nodes.a]\nkind = "script"\nrun = "cat \\"$DISCRETION_INPUT\\" > \\"$DISCRETION_RUN_DIR/seen\\""\nexit = { 0 = "ok" }\non = { ok = "z" }\n\n[nodes.z]\nkind = "end"\noutcome = "filed"\n`;

function discretion(dir: string, args: string[]) {
  return spawnSync(process.execPath, [bin, ...args], {
    cwd: dir,
    encoding: "utf8",
    env: { PATH: process.env.PATH, HOME: dir },
  });
}

describe("discretion run", () => {
  it("runs workflows/<name>.toml, prints the result and records the events", () => {
    const dir = home();
    workflow(dir, ok);
    const result = discretion(dir, ["run", "demo"]);
    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
    const printed = JSON.parse(result.stdout) as Record<string, string>;
    expect(printed.outcome).toBe("filed");
    expect(printed.status).toBe("ended");
    const state = join(dir, ".local", "state", "discretion");
    expect(printed.run_dir).toBe(join(state, "runs", "demo", printed.run_id ?? ""));
    const types = readFileSync(join(state, "events.jsonl"), "utf8")
      .trimEnd()
      .split("\n")
      .map((line) => (JSON.parse(line) as { type: string }).type);
    expect(types).toEqual(["run.started", "run.ended"]);
  });

  it("passes --input to the nodes", () => {
    const dir = home();
    workflow(dir, ok);
    writeFileSync(join(dir, "in.json"), '{"capture_id":"cap_20261113_abc234"}');
    const result = discretion(dir, ["run", "demo", "--input", "in.json"]);
    expect(result.status).toBe(0);
    const printed = JSON.parse(result.stdout) as { run_dir: string };
    expect(readFileSync(join(printed.run_dir, "seen"), "utf8")).toBe(
      '{"capture_id":"cap_20261113_abc234"}',
    );
  });

  it("accepts a path to the workflow file", () => {
    const dir = home();
    workflow(dir, ok);
    expect(discretion(dir, ["run", "workflows/demo.toml"]).status).toBe(0);
  });

  it("exits 1 and prints the error and its remedy when a node fails for good", () => {
    const dir = home();
    workflow(
      dir,
      `[nodes.a]\nkind = "script"\nrun = "exit 9"\nexit = { 0 = "ok" }\non = { ok = "z" }\n\n[nodes.z]\nkind = "end"\noutcome = "filed"\n`,
    );
    const result = discretion(dir, ["run", "demo"]);
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/^D6007 /);
    expect(result.stderr).toMatch(/Remedy: /);
    expect((JSON.parse(result.stdout) as { status: string }).status).toBe("failed");
  });

  it("exits 1 with the error when the workflow is refused", () => {
    const dir = home();
    const result = discretion(dir, ["run", "demo"]);
    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toMatch(/^D6006 /);
    expect(existsSync(join(dir, ".local"))).toBe(false);
  });

  it.each([
    [["run"]],
    [["run", "a", "b"]],
    [["run", "demo", "--input"]],
    [["run", "--bogus", "x"]],
  ])("prints usage and exits 2 for %j", (args) => {
    const result = discretion(home(), args);
    expect(result.status).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe("Usage: discretion run <workflow> [--input <file>]\n");
  });
});
