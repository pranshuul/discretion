import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { shippedTemplate } from "../src/assets.js";
import { install } from "../src/install.js";
import { templateDiff, templateReset } from "../src/templates.js";
import { fakePins, startFakeGithub, type FakeGithub } from "./fake-github.js";

let github: FakeGithub;
let vault: string;
const made: string[] = [];
const path = (name: string): string => join(vault, "1-Roots/_roots/templates", `${name}.md`);

beforeEach(async () => {
  github = await startFakeGithub();
  const dir = mkdtempSync(join(tmpdir(), "roots-templates-"));
  made.push(dir);
  vault = join(dir, "vault");
  await install({ vault, githubBase: github.base, plugins: fakePins(), platform: "linux" });
});

afterEach(async () => {
  await github.close();
  for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("roots template diff", () => {
  it("is empty for an untouched template", async () => {
    expect(await templateDiff(vault, "daily")).toBe("");
  });

  it("shows added and removed lines against the shipped default", async () => {
    const shipped = shippedTemplate("weekly");
    writeFileSync(
      path("weekly"),
      shipped.replace("## Summary\n", "## Summary\n\nMy extra line\n").replace("## Days\n", ""),
    );
    const diff = await templateDiff(vault, "weekly");
    expect(diff).toContain("--- shipped weekly.md");
    expect(diff).toContain("+++ 1-Roots/_roots/templates/weekly.md");
    expect(diff).toContain("\n+My extra line");
    expect(diff).toContain("\n-## Days");
    expect(diff).not.toContain("\n-## Logs");
  });

  it("shows a missing template as entirely removed", async () => {
    rmSync(path("yearly"));
    const diff = await templateDiff(vault, "yearly");
    expect(diff).toContain("\n-# {{title}}");
  });
});

describe("roots template reset", () => {
  it("restores the shipped default and reports the change", async () => {
    writeFileSync(path("daily"), "mine\n");
    expect(await templateReset(vault, "daily")).toBe(true);
    expect(readFileSync(path("daily"), "utf8")).toBe(shippedTemplate("daily"));
    expect(await templateDiff(vault, "daily")).toBe("");
  });

  it("does nothing when the template is already the default", async () => {
    expect(await templateReset(vault, "daily")).toBe(false);
  });

  it("recreates a deleted template", async () => {
    rmSync(path("repair"));
    expect(await templateReset(vault, "repair")).toBe(true);
    expect(readFileSync(path("repair"), "utf8")).toBe(shippedTemplate("repair"));
  });

  it("with dryRun reports the change and writes nothing", async () => {
    writeFileSync(path("home"), "mine\n");
    expect(await templateReset(vault, "home", true)).toBe(true);
    expect(readFileSync(path("home"), "utf8")).toBe("mine\n");
  });

  it("leaves the other templates alone", async () => {
    writeFileSync(path("daily"), "mine\n");
    writeFileSync(path("weekly"), "mine too\n");
    await templateReset(vault, "daily");
    expect(readFileSync(path("weekly"), "utf8")).toBe("mine too\n");
  });
});
