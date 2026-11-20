import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { shippedTemplate } from "../src/assets.js";
import { templateDiff, templateReset } from "../src/templates.js";

let vault: string;
beforeEach(() => {
  vault = mkdtempSync(join(tmpdir(), "roots-templates-"));
  mkdirSync(join(vault, "1-Roots/_roots/templates"), { recursive: true });
});
afterEach(() => rmSync(vault, { recursive: true, force: true }));

const file = (name: string): string => join(vault, `1-Roots/_roots/templates/${name}.md`);

describe("templateDiff", () => {
  it("is empty for the shipped default", async () => {
    writeFileSync(file("daily"), shippedTemplate("daily"));
    expect(await templateDiff(vault, "daily")).toBe("");
  });

  it("shows what an edit changed, from the shipped default to the edited file", async () => {
    const shipped = shippedTemplate("home");
    writeFileSync(file("home"), shipped.replace("## Streaks", "## My streaks"));
    const diff = await templateDiff(vault, "home");
    expect(diff.startsWith("--- shipped home.md\n+++ 1-Roots/_roots/templates/home.md\n@@")).toBe(
      true,
    );
    expect(diff).toContain("-## Streaks\n+## My streaks\n");
  });

  it("shows a missing template as everything removed", async () => {
    const diff = await templateDiff(vault, "home");
    expect(diff).toContain("-# {{title}}");
  });
});

describe("templateReset", () => {
  it("restores the default and says it changed", async () => {
    writeFileSync(file("weekly"), "mine\n");
    expect(await templateReset(vault, "weekly")).toBe(true);
    expect(readFileSync(file("weekly"), "utf8")).toBe(shippedTemplate("weekly"));
  });

  it("changes nothing when the file is already the default", async () => {
    writeFileSync(file("weekly"), shippedTemplate("weekly"));
    expect(await templateReset(vault, "weekly")).toBe(false);
  });

  it("with dryRun reports the change and leaves the file alone", async () => {
    writeFileSync(file("weekly"), "mine\n");
    expect(await templateReset(vault, "weekly", true)).toBe(true);
    expect(readFileSync(file("weekly"), "utf8")).toBe("mine\n");
  });

  it("recreates a missing template", async () => {
    expect(await templateReset(vault, "yearly")).toBe(true);
    expect(readFileSync(file("yearly"), "utf8")).toBe(shippedTemplate("yearly"));
  });
});
