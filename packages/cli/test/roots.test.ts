import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { systemClock, today } from "@discretion/core";
import { install } from "../../roots/src/install.js";
import { render } from "../../roots/src/render.js";
import { shipped } from "../../roots/test/roots-helpers.js";
import { fakePins, startFakeGithub, type FakeGithub } from "../../roots/test/fake-github.js";
import { run } from "../src/main.js";

let github: FakeGithub;
let dir: string;
let vault: string;
const saved = process.env.DISCRETION_GITHUB_BASE;

beforeEach(async () => {
  github = await startFakeGithub();
  dir = mkdtempSync(join(tmpdir(), "cli-roots-"));
  vault = join(dir, "vault");
  process.env.DISCRETION_GITHUB_BASE = github.base;
});

afterEach(async () => {
  await github.close();
  rmSync(dir, { recursive: true, force: true });
  if (saved === undefined) delete process.env.DISCRETION_GITHUB_BASE;
  else process.env.DISCRETION_GITHUB_BASE = saved;
});

async function cli(...argv: string[]): Promise<{ code: number; out: string; err: string }> {
  let out = "";
  let err = "";
  const code = await run(
    argv,
    { write: (t: string) => (out += t) },
    { write: (t: string) => (err += t) },
  );
  return { code, out, err };
}

const seeded = async (): Promise<void> => {
  await install({ vault, githubBase: github.base, plugins: fakePins() });
};

describe("discretion roots install", () => {
  it("--dry-run lists what it would do and writes nothing", async () => {
    const { code, out } = await cli("roots", "install", "--vault", vault, "--dry-run");
    expect(code).toBe(0);
    expect(out).toContain("would: ");
    expect(out).toContain("1-Roots/Roots.md");
    expect(existsSync(vault)).toBe(false);
    expect(github.requests).toHaveLength(0);
  });

  it("--json gives the changes with sorted keys", async () => {
    const { code, out } = await cli("roots", "install", "--vault", vault, "--dry-run", "--json");
    expect(code).toBe(0);
    const parsed = JSON.parse(out) as { changes: string[]; dry_run: boolean };
    expect(parsed.dry_run).toBe(true);
    expect(parsed.changes.length).toBeGreaterThan(0);
    expect(Object.keys(parsed)).toEqual(["changes", "dry_run"]);
  });

  it("refuses on a hash mismatch with D2010, a remedy line and exit 1", async () => {
    // The real pins never match the fake server's files.
    const { code, err } = await cli("roots", "install", "--vault", vault);
    expect(code).toBe(1);
    expect(err).toContain("D2010");
    expect(err).toContain("Remedy:");
    expect(existsSync(vault)).toBe(false);
  });

  it("defaults the vault to ~/vault from HOME when no config names one", async () => {
    const home = join(dir, "home");
    mkdirSync(home);
    const before = process.env.HOME;
    process.env.HOME = home;
    try {
      const { out } = await cli("roots", "install", "--dry-run", "--json");
      expect(JSON.parse(out)).toHaveProperty("changes");
      expect(existsSync(join(home, "vault"))).toBe(false);
    } finally {
      process.env.HOME = before;
    }
  });

  it("prints usage and exits 2 for a bad flag", async () => {
    const { code, err } = await cli("roots", "install", "--nope");
    expect(code).toBe(2);
    expect(err).toContain("Usage: discretion roots");
  });
});

describe("discretion roots status", () => {
  it("lists drift and exits 1 on a vault that was never installed", async () => {
    const { code, out } = await cli("roots", "status", "--vault", vault);
    expect(code).toBe(1);
    expect(out).toContain("drift");
    expect(out).toContain("plugins.lock.json");
  });

  it("--json lists the items", async () => {
    await seeded();
    const { out } = await cli("roots", "status", "--vault", vault, "--json");
    const parsed = JSON.parse(out) as { items: { kind: string; name: string; message: string }[] };
    // The fake plugins do not match the real pins, so they show up as drift.
    expect(parsed.items.some((i) => i.kind === "plugin")).toBe(true);
  });

  it("does not list an edited template: it is Pranshul's own", async () => {
    await seeded();
    writeFileSync(join(vault, "1-Roots/_roots/templates/daily.md"), "mine\n");
    const { out } = await cli("roots", "status", "--vault", vault);
    expect(out).not.toContain("template daily");
    expect(out).toContain("drift plugin");
  });

  it("has no --dry-run: it prints usage and exits 2", async () => {
    expect((await cli("roots", "status", "--vault", vault, "--dry-run")).code).toBe(2);
  });
});

describe("discretion roots", () => {
  it("prints usage and exits 2 without a subcommand or with an unknown one", async () => {
    expect((await cli("roots")).code).toBe(2);
    const unknown = await cli("roots", "frobnicate");
    expect(unknown.code).toBe(2);
    expect(unknown.err).toContain("Usage: discretion roots");
    expect(unknown.err).toContain("roots template check");
    expect((await cli("roots", "template", "frob", "daily")).code).toBe(2);
    expect((await cli("roots", "template", "diff", "nope")).code).toBe(2);
    expect((await cli("roots", "new")).code).toBe(2);
    expect((await cli("roots", "new", "hourly")).code).toBe(2);
    expect((await cli("roots", "new", "daily", "2026-02-30")).code).toBe(2);
    expect((await cli("roots", "repair")).code).toBe(2);
  });
});

describe("discretion roots new", () => {
  it("writes the note and says where", async () => {
    await seeded();
    const { code, out } = await cli("roots", "new", "daily", "2026-11-05", "--vault", vault);
    expect(code).toBe(0);
    expect(out).toBe("created 1-Roots/Daily/2026/11/2026-11-05.md\n");
    const note = readFileSync(join(vault, "1-Roots/Daily/2026/11/2026-11-05.md"), "utf8");
    expect(note).toBe(render("daily", "2026-11-05", shipped("daily")));
  });

  it("uses today's date when none is given", async () => {
    await seeded();
    const { out } = await cli("roots", "new", "daily", "--vault", vault);
    const day = today(systemClock);
    expect(out).toContain(`/${day}.md`);
  });

  it("leaves an existing note alone and says so", async () => {
    await seeded();
    await cli("roots", "new", "weekly", "2026-11-05", "--vault", vault);
    writeFileSync(join(vault, "1-Roots/Weekly/2026/2026-W45.md"), "mine\n");
    const { code, out } = await cli("roots", "new", "weekly", "2026-11-03", "--vault", vault);
    expect(code).toBe(0);
    expect(out).toBe("1-Roots/Weekly/2026/2026-W45.md already exists; left as it is\n");
    expect(readFileSync(join(vault, "1-Roots/Weekly/2026/2026-W45.md"), "utf8")).toBe("mine\n");
  });

  it("--dry-run writes nothing; --json gives sorted keys", async () => {
    await seeded();
    const { out } = await cli(
      "roots",
      "new",
      "monthly",
      "2026-11-05",
      "--vault",
      vault,
      "--dry-run",
      "--json",
    );
    expect(JSON.parse(out)).toEqual({
      created: true,
      dry_run: true,
      path: "1-Roots/Monthly/2026/2026-11.md",
    });
    expect(Object.keys(JSON.parse(out) as object)).toEqual(["created", "dry_run", "path"]);
    expect(existsSync(join(vault, "1-Roots/Monthly"))).toBe(false);
    expect(out.startsWith("{")).toBe(true);
  });

  it("refuses with D2011 and a remedy when Roots is not installed", async () => {
    const { code, err } = await cli("roots", "new", "daily", "2026-11-05", "--vault", vault);
    expect(code).toBe(1);
    expect(err).toContain("D2011");
    expect(err).toContain("Remedy: ");
  });
});

describe("discretion roots repair", () => {
  const path = "1-Roots/Daily/2026/11/2026-11-05.md";
  const gitIn = (...args: string[]): string =>
    execFileSync("git", ["-C", vault, ...args], { encoding: "utf8" });
  async function broken(): Promise<void> {
    await seeded();
    await cli("roots", "new", "daily", "2026-11-05", "--vault", vault);
    const text = readFileSync(join(vault, path), "utf8")
      .replace(
        "<!-- discretion:journal:start -->\n\n",
        "<!-- discretion:journal:start -->\nkept text\n",
      )
      .replace(
        "## Captured\n\n<!-- discretion:captured:start -->\n<!-- discretion:captured:end -->\n\n",
        "",
      );
    writeFileSync(join(vault, path), text);
    gitIn("init", "-q");
    gitIn("config", "user.email", "t@example.com");
    gitIn("config", "user.name", "T");
    gitIn("add", "-A");
    gitIn("commit", "-q", "-m", "start");
  }

  it("--dry-run shows the diff and changes nothing", async () => {
    await broken();
    const before = readFileSync(join(vault, path), "utf8");
    const { code, out } = await cli("roots", "repair", "2026-11-05", "--vault", vault, "--dry-run");
    expect(code).toBe(0);
    expect(out).toContain("+## Captured");
    expect(readFileSync(join(vault, path), "utf8")).toBe(before);
  });

  it("repairs the note, commits before and after and reports it", async () => {
    await broken();
    const { code, out } = await cli("roots", "repair", "2026-11-05", "--vault", vault);
    expect(code).toBe(0);
    expect(out).toBe(`repaired ${path}\n`);
    expect(readFileSync(join(vault, path), "utf8")).toContain("kept text");
    expect(gitIn("log", "--format=%s").split("\n")[0]).toBe(`discretion: roots repair ${path}`);
  });

  it("says when there is nothing to repair", async () => {
    await broken();
    await cli("roots", "repair", "2026-11-05", "--vault", vault);
    const { code, out } = await cli("roots", "repair", "2026-11-05", "--vault", vault);
    expect(code).toBe(0);
    expect(out).toBe(`${path} needs no repair\n`);
  });

  it("--json gives the path, whether it changed and the diff", async () => {
    await broken();
    const { out } = await cli(
      "roots",
      "repair",
      "2026-11-05",
      "--vault",
      vault,
      "--dry-run",
      "--json",
    );
    const parsed = JSON.parse(out) as {
      changed: boolean;
      diff: string;
      dry_run: boolean;
      path: string;
    };
    expect(parsed).toMatchObject({ changed: true, dry_run: true, path });
    expect(parsed.diff).toContain("+## Captured");
    expect(Object.keys(parsed)).toEqual(["changed", "diff", "dry_run", "path"]);
  });

  it("refuses an unknown note with D2013, exit 1", async () => {
    await broken();
    const { code, err } = await cli("roots", "repair", "2030-01-01", "--vault", vault);
    expect(code).toBe(1);
    expect(err).toContain("D2013");
  });
});

describe("discretion roots template", () => {
  it("check passes on the shipped templates, and --json lists nothing", async () => {
    await seeded();
    const { code, out } = await cli("roots", "template", "check", "--vault", vault);
    expect(code).toBe(0);
    expect(out).toBe("ok: 6 templates and 8 launchers\n");
    const json = await cli("roots", "template", "check", "--vault", vault, "--json");
    expect(JSON.parse(json.out)).toEqual({ ok: true, problems: [] });
  });

  it("check exits 1 on an error, naming the file, line and fix; warnings alone exit 0", async () => {
    await seeded();
    const file = join(vault, "1-Roots/_roots/templates/daily.md");
    const original = readFileSync(file, "utf8");
    writeFileSync(file, `${original}\n{{mood}}\n`);
    const bad = await cli("roots", "template", "check", "daily", "--vault", vault);
    expect(bad.code).toBe(1);
    expect(bad.out).toMatch(/^error daily\.md:\d+: .*\{\{mood\}\}.*\n {2}fix: /m);
    const json = JSON.parse(
      (await cli("roots", "template", "check", "--vault", vault, "--json")).out,
    ) as {
      ok: boolean;
      problems: { severity: string; file: string; line: number; code: string; fix: string }[];
    };
    expect(json.ok).toBe(false);
    expect(json.problems[0]).toMatchObject({
      severity: "error",
      file: "daily.md",
      code: "unknown-placeholder",
    });
    writeFileSync(
      file,
      original
        .replace("<!-- discretion:ribbon:start -->\n", "")
        .replace("<!-- discretion:ribbon:end -->\n", ""),
    );
    const warn = await cli("roots", "template", "check", "--vault", vault);
    expect(warn.code).toBe(0);
    expect(warn.out).toMatch(/^warning daily\.md/m);
  });

  it("diff shows an edit against the shipped default, and reset restores it", async () => {
    await seeded();
    const file = join(vault, "1-Roots/_roots/templates/home.md");
    writeFileSync(file, readFileSync(file, "utf8").replace("## Streaks", "## My streaks"));
    const diff = await cli("roots", "template", "diff", "home", "--vault", vault);
    expect(diff.code).toBe(0);
    expect(diff.out).toContain("+## My streaks");
    const dry = await cli("roots", "template", "reset", "home", "--vault", vault, "--dry-run");
    expect(dry.out).toBe("would: reset home.md to the shipped default\n");
    expect(readFileSync(file, "utf8")).toContain("My streaks");
    const reset = await cli("roots", "template", "reset", "home", "--vault", vault);
    expect(reset.out).toBe("reset home.md to the shipped default\n");
    expect(readFileSync(file, "utf8")).not.toContain("My streaks");
    expect((await cli("roots", "template", "diff", "home", "--vault", vault)).out).toBe(
      "home.md is the shipped default\n",
    );
    expect((await cli("roots", "template", "reset", "home", "--vault", vault)).out).toBe(
      "home.md is already the shipped default\n",
    );
  });

  it("diff and reset take --json", async () => {
    await seeded();
    const diff = JSON.parse(
      (await cli("roots", "template", "diff", "daily", "--vault", vault, "--json")).out,
    );
    expect(diff).toEqual({ diff: "", template: "daily" });
    const reset = JSON.parse(
      (await cli("roots", "template", "reset", "daily", "--vault", vault, "--dry-run", "--json"))
        .out,
    );
    expect(reset).toEqual({ changed: false, dry_run: true, template: "daily" });
  });
});
