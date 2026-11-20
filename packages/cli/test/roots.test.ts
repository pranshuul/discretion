import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { install } from "../../roots/src/install.js";
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

  it("does not list an edited template", async () => {
    await seeded();
    writeFileSync(join(vault, "1-Roots/_roots/templates/daily.md"), "mine\n");
    const { out } = await cli("roots", "status", "--vault", vault);
    expect(out).not.toContain("template daily");
    expect(out).not.toContain("modified");
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
    expect(unknown.err).not.toContain("template");
    expect((await cli("roots", "template", "diff", "daily")).code).toBe(2);
  });
});
