import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { shippedQuestions, shippedTemplate } from "../src/assets.js";
import { newNote, repairNote } from "../src/notes.js";
import { render } from "../src/render.js";
import { kinds, shipped } from "./roots-helpers.js";

let vault: string;
beforeEach(() => {
  vault = mkdtempSync(join(tmpdir(), "roots-notes-"));
  for (const k of kinds) put(`1-Roots/_roots/templates/${k}.md`, shippedTemplate(k));
  put("1-Roots/_roots/questions.md", shippedQuestions());
});
afterEach(() => rmSync(vault, { recursive: true, force: true }));

const put = (path: string, text: string): void => {
  mkdirSync(dirname(join(vault, path)), { recursive: true });
  writeFileSync(join(vault, path), text);
};
const read = (path: string): string => readFileSync(join(vault, path), "utf8");
const git = (...args: string[]): string =>
  execFileSync("git", ["-C", vault, ...args], { encoding: "utf8" });
const initGit = (): void => {
  git("init", "-q");
  git("config", "user.email", "t@example.com");
  git("config", "user.name", "T");
  git("add", "-A");
  git("commit", "-q", "-m", "start");
};

describe("newNote", () => {
  it.each(kinds)("writes the %s note at its path, with the renderer's bytes", async (kind) => {
    const result = await newNote({ vault, kind, date: "2026-11-05" });
    expect(result.created).toBe(true);
    expect(read(result.path)).toBe(render(kind, "2026-11-05", shipped(kind)));
  });

  it("puts a note where the path rules say", async () => {
    expect((await newNote({ vault, kind: "daily", date: "2026-11-05" })).path).toBe(
      "1-Roots/Daily/2026/11/2026-11-05.md",
    );
    expect((await newNote({ vault, kind: "weekly", date: "2026-11-05" })).path).toBe(
      "1-Roots/Weekly/2026/2026-W45.md",
    );
  });

  it("never renders a note that exists again", async () => {
    put("1-Roots/Daily/2026/11/2026-11-05.md", "mine\n");
    const result = await newNote({ vault, kind: "daily", date: "2026-11-05" });
    expect(result).toEqual({ path: "1-Roots/Daily/2026/11/2026-11-05.md", created: false });
    expect(read("1-Roots/Daily/2026/11/2026-11-05.md")).toBe("mine\n");
  });

  it("with dryRun writes nothing and says what it would do", async () => {
    const result = await newNote({ vault, kind: "daily", date: "2026-11-05", dryRun: true });
    expect(result.created).toBe(true);
    expect(existsSync(join(vault, "1-Roots/Daily"))).toBe(false);
  });

  it("uses an edited template", async () => {
    put("1-Roots/_roots/templates/daily.md", "mine {{date}}\n");
    const { path } = await newNote({ vault, kind: "daily", date: "2026-11-05" });
    expect(read(path)).toBe("mine 2026-11-05\n");
  });

  it("refuses with D2011 when Roots is not installed", async () => {
    rmSync(join(vault, "1-Roots/_roots"), { recursive: true });
    await expect(newNote({ vault, kind: "daily", date: "2026-11-05" })).rejects.toMatchObject({
      code: "D2011",
    });
    expect(existsSync(join(vault, "1-Roots/Daily"))).toBe(false);
  });
});

describe("repairNote", () => {
  const path = "1-Roots/Daily/2026/11/2026-11-05.md";
  const fresh = (): string => render("daily", "2026-11-05", shipped("daily"));
  const broken = (): string =>
    fresh()
      .replace(
        "<!-- discretion:journal:start -->\n\n",
        "<!-- discretion:journal:start -->\nkept text\n",
      )
      .replace("rating:\n", "rating: 7\n")
      .replace(
        "## Captured\n\n<!-- discretion:captured:start -->\n<!-- discretion:captured:end -->\n\n",
        "",
      );

  it("restores the deleted section from the current template and keeps what was written", async () => {
    put(path, broken());
    initGit();
    const result = await repairNote({ vault, target: path });
    expect(result.changed).toBe(true);
    expect(result.path).toBe(path);
    const text = read(path);
    expect(text).toContain("## Captured\n\n<!-- discretion:captured:start -->");
    expect(text).toContain("kept text");
    expect(text).toContain("rating: 7\n");
  });

  it("takes a date as its target", async () => {
    put(path, broken());
    initGit();
    expect((await repairNote({ vault, target: "2026-11-05" })).path).toBe(path);
  });

  it("takes a date of every period kind", async () => {
    for (const [target, expected] of [
      ["2026-W45", "1-Roots/Weekly/2026/2026-W45.md"],
      ["2026-11", "1-Roots/Monthly/2026/2026-11.md"],
      ["2026-Q4", "1-Roots/Quarterly/2026/2026-Q4.md"],
      ["2026", "1-Roots/Yearly/2026.md"],
    ] as const) {
      put(expected, "stray\n");
      const result = await repairNote({ vault, target, dryRun: true });
      expect(result.path).toBe(expected);
    }
  });

  it("takes a path inside the vault, relative to the vault or to 1-Roots", async () => {
    put(path, broken());
    expect(
      (await repairNote({ vault, target: "Daily/2026/11/2026-11-05.md", dryRun: true })).path,
    ).toBe(path);
    expect((await repairNote({ vault, target: join(vault, path), dryRun: true })).path).toBe(path);
  });

  it("commits the vault before and after, so the repair can be undone", async () => {
    put(path, broken());
    initGit();
    put("1-Roots/other.md", "uncommitted\n");
    await repairNote({ vault, target: path });
    const log = git("log", "--format=%s").trim().split("\n");
    expect(log).toHaveLength(3);
    expect(log[0]).toBe(`discretion: roots repair ${path}`);
    expect(log[1]).toBe(`discretion: roots repair ${path} (before)`);
    expect(git("show", "HEAD~1:" + path)).toBe(broken());
    expect(git("status", "--porcelain")).toBe("");
    git("revert", "--no-edit", "HEAD");
    expect(read(path)).toBe(broken());
  });

  it("makes no before commit when the tree is clean, and none at all when nothing changes", async () => {
    put(path, fresh());
    initGit();
    const result = await repairNote({ vault, target: path });
    expect(result).toEqual({ path, changed: false, diff: "" });
    expect(git("log", "--format=%s").trim().split("\n")).toEqual(["start"]);
    put(path, broken());
    git("add", "-A");
    git("commit", "-q", "-m", "edit");
    await repairNote({ vault, target: path });
    expect(git("log", "--format=%s").trim().split("\n")).toEqual([
      `discretion: roots repair ${path}`,
      "edit",
      "start",
    ]);
  });

  it("with dryRun returns the diff and changes nothing, in or out of git", async () => {
    put(path, broken());
    const result = await repairNote({ vault, target: path, dryRun: true });
    expect(result.changed).toBe(true);
    expect(result.diff).toContain("+## Captured");
    expect(result.diff.startsWith(`--- ${path}\n+++ ${path} (repaired)\n`)).toBe(true);
    expect(read(path)).toBe(broken());
    initGit();
    await repairNote({ vault, target: path, dryRun: true });
    expect(git("log", "--format=%s").trim().split("\n")).toEqual(["start"]);
  });

  it("refuses a real run outside a git repository, with D2012, and writes nothing", async () => {
    put(path, broken());
    await expect(repairNote({ vault, target: path })).rejects.toMatchObject({ code: "D2012" });
    expect(read(path)).toBe(broken());
  });

  it("refuses a note that does not exist, and a file that is not a Roots note, with D2013", async () => {
    initGit();
    await expect(repairNote({ vault, target: "2030-01-01" })).rejects.toMatchObject({
      code: "D2013",
    });
    put("Elsewhere/idea.md", "# idea\n");
    await expect(repairNote({ vault, target: "Elsewhere/idea.md" })).rejects.toMatchObject({
      code: "D2013",
    });
  });

  it("repairs twice to the same bytes", async () => {
    put(path, broken());
    initGit();
    await repairNote({ vault, target: path });
    const once = read(path);
    const again = await repairNote({ vault, target: path });
    expect(again.changed).toBe(false);
    expect(read(path)).toBe(once);
  });
});
