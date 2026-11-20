import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { shippedTemplate } from "../../roots/src/assets.js";
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
  await install({ vault, githubBase: github.base, plugins: fakePins(), platform: "linux" });
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

  it("--json gives the changes and notices with sorted keys", async () => {
    const { code, out } = await cli("roots", "install", "--vault", vault, "--dry-run", "--json");
    expect(code).toBe(0);
    const parsed = JSON.parse(out) as { changes: string[]; dry_run: boolean; notices: string[] };
    expect(parsed.dry_run).toBe(true);
    expect(parsed.changes.length).toBeGreaterThan(0);
    expect(parsed.notices).toEqual([]);
    expect(Object.keys(parsed)).toEqual(["changes", "dry_run", "notices"]);
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
    const parsed = JSON.parse(out) as { items: { kind: string; severity: string }[] };
    // The fake plugins do not match the real pins, so they show up as drift.
    expect(parsed.items.some((i) => i.kind === "plugin" && i.severity === "drift")).toBe(true);
  });

  it("shows an edited template as modified", async () => {
    await seeded();
    writeFileSync(join(vault, "1-Roots/_roots/templates/daily.md"), "mine\n");
    const { out } = await cli("roots", "status", "--vault", vault);
    expect(out).toContain("modified");
    expect(out).toContain("template daily");
    expect(out).toContain("differs from the shipped default");
  });
});

describe("discretion roots template", () => {
  beforeEach(seeded);

  it("diff prints the difference from the shipped default", async () => {
    writeFileSync(join(vault, "1-Roots/_roots/templates/weekly.md"), "mine\n");
    const { code, out } = await cli("roots", "template", "diff", "weekly", "--vault", vault);
    expect(code).toBe(0);
    expect(out).toContain("--- shipped weekly.md");
    expect(out).toContain("+mine");
  });

  it("diff says so when the template is the default", async () => {
    const { code, out } = await cli("roots", "template", "diff", "daily", "--vault", vault);
    expect(code).toBe(0);
    expect(out).toBe("daily.md is the shipped default\n");
  });

  it("reset restores the default, and --dry-run only says so", async () => {
    const file = join(vault, "1-Roots/_roots/templates/daily.md");
    writeFileSync(file, "mine\n");
    const dry = await cli("roots", "template", "reset", "daily", "--vault", vault, "--dry-run");
    expect(dry.out).toBe("would: reset daily.md to the shipped default\n");
    expect(readFileSync(file, "utf8")).toBe("mine\n");
    const real = await cli("roots", "template", "reset", "daily", "--vault", vault);
    expect(real.code).toBe(0);
    expect(real.out).toBe("reset daily.md to the shipped default\n");
    expect(readFileSync(file, "utf8")).toBe(shippedTemplate("daily"));
  });

  it("reset --json reports whether anything changed", async () => {
    const { out } = await cli("roots", "template", "reset", "daily", "--vault", vault, "--json");
    expect(JSON.parse(out)).toEqual({ changed: false, dry_run: false, template: "daily" });
  });

  it("refuses a template that does not exist with exit 2", async () => {
    const { code, err } = await cli("roots", "template", "diff", "nope", "--vault", vault);
    expect(code).toBe(2);
    expect(err).toContain("Usage: discretion roots template");
  });
});

describe("discretion roots", () => {
  it("prints usage and exits 2 without a subcommand or with an unknown one", async () => {
    expect((await cli("roots")).code).toBe(2);
    const unknown = await cli("roots", "frobnicate");
    expect(unknown.code).toBe(2);
    expect(unknown.err).toContain("Usage: discretion roots");
  });
});
