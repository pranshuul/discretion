import { spawnSync } from "node:child_process";
import {
  accessSync,
  constants,
  existsSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = fileURLToPath(new URL("../", import.meta.url));
const script = `${root}ops/d1.sh`;

const folders = [
  "1-Roots",
  "2-Orchard",
  "3-Mycelium/canon",
  "3-Mycelium/inbox",
  "3-Mycelium/goals",
  "3-Mycelium/tasks",
  "3-Mycelium/plans",
  "3-Mycelium/review/items",
  "3-Mycelium/reels",
  "3-Mycelium/days",
  "3-Mycelium/ribbons",
  "3-Mycelium/config",
  "4-Nursery/cards",
  "4-Nursery/concepts",
];

function fresh(): string {
  return join(mkdtempSync(join(tmpdir(), "d1-ops-")), "vault");
}

function run(vault: string, ...flags: string[]) {
  const result = spawnSync("bash", [script, "--vault", vault, ...flags], {
    encoding: "utf8",
    env: { PATH: process.env.PATH, HOME: join(vault, "..", "home") },
  });
  return { status: result.status, out: result.stdout, err: result.stderr };
}

describe("ops/d1.sh", () => {
  it("is executable", () => {
    expect(() => accessSync(script, constants.X_OK)).not.toThrow();
  });

  it("with --dry-run reports what it would do and changes nothing", () => {
    const vault = fresh();
    const { status, out } = run(vault, "--dry-run");
    expect(status).toBe(0);
    expect(out).toContain("git init");
    expect(out).toContain("1-Roots");
    expect(out).toContain(".gitattributes");
    expect(existsSync(vault)).toBe(false);
  });

  it("creates the git repository with every folder from Architecture", () => {
    const vault = fresh();
    expect(run(vault).status).toBe(0);
    expect(existsSync(join(vault, ".git"))).toBe(true);
    for (const folder of folders) expect(existsSync(join(vault, folder))).toBe(true);
  });

  it("writes .gitignore and .gitattributes", () => {
    const vault = fresh();
    run(vault);
    const ignore = readFileSync(join(vault, ".gitignore"), "utf8").split("\n");
    expect(ignore).toContain(".obsidian/workspace*.json");
    expect(ignore).toContain(".trash/");
    const attributes = readFileSync(join(vault, ".gitattributes"), "utf8").split("\n");
    expect(attributes).toContain("1-Roots/** filter=git-crypt diff=git-crypt");
  });

  it("makes git honour those files", () => {
    const vault = fresh();
    run(vault);
    const check = (args: string[]) =>
      spawnSync("git", ["-C", vault, ...args], { encoding: "utf8" }).stdout;
    expect(
      check(["check-ignore", ".obsidian/workspace.json", ".trash/x.md"]).trim().split("\n"),
    ).toEqual([".obsidian/workspace.json", ".trash/x.md"]);
    expect(check(["check-attr", "filter", "diff", "1-Roots/a/b.md"])).toContain("git-crypt");
  });

  it("is idempotent and keeps what is already there", () => {
    const vault = fresh();
    run(vault);
    writeFileSync(
      join(vault, ".gitignore"),
      `${readFileSync(join(vault, ".gitignore"), "utf8")}mine/\n`,
    );
    writeFileSync(join(vault, "2-Orchard", "note.md"), "mine");
    const first = readFileSync(join(vault, ".gitattributes"), "utf8");
    const again = run(vault);
    expect(again.status).toBe(0);
    expect(readFileSync(join(vault, ".gitattributes"), "utf8")).toBe(first);
    const ignore = readFileSync(join(vault, ".gitignore"), "utf8");
    expect(ignore.match(/\.trash\//g)).toHaveLength(1);
    expect(ignore).toContain("mine/");
    expect(readFileSync(join(vault, "2-Orchard", "note.md"), "utf8")).toBe("mine");
  });

  it("dry-run on an existing vault reports nothing to do", () => {
    const vault = fresh();
    run(vault);
    const { status, out } = run(vault, "--dry-run");
    expect(status).toBe(0);
    expect(out).not.toContain("git init");
    expect(out).toContain("nothing to do");
  });

  it("rejects an unknown flag", () => {
    expect(run(fresh(), "--nope").status).not.toBe(0);
  });
});
