import { describe, expect, it } from "vitest";
import { noteKinds, queryNames, shippedAgents } from "../src/assets.js";
import { requiredKeys } from "../src/frontmatter.js";
import { loadDesign } from "./design-helpers.js";

const agents = (): string => shippedAgents();

const writers: Record<string, string> = {
  journal: "Pranshul",
  habits: "habit stamper",
  plan: "planner",
  captured: "capture pipeline",
  pictures: "Pranshul",
  qa: "Pranshul",
  private: "Pranshul",
  ribbon: "tracker",
  summary: "local model",
  reflection: "Pranshul",
};

describe("AGENTS.md, the contract for an agent editing the templates", () => {
  it("lists every placeholder and what it fills", () => {
    const text = agents();
    for (const placeholder of [
      "{{frontmatter}}",
      "{{title}}",
      "{{links}}",
      "{{date}}",
      "{{question}}",
      "{{query:<name>}}",
    ]) {
      expect(text, placeholder).toContain(placeholder);
    }
    for (const name of queryNames) expect(text, name).toContain(`{{query:${name}}}`);
  });

  it("lists every marker pair with the component that writes it", () => {
    const text = agents();
    for (const [name, writer] of Object.entries(writers)) {
      const line = text.split("\n").find((l) => l.includes(`discretion:${name}:start`));
      expect(line, name).toBeDefined();
      expect(line, name).toContain(writer);
      expect(text).toContain(`<!-- discretion:${name}:end -->`);
    }
    expect(text).toContain("<!-- roots:quick-notes:end -->");
  });

  it("says which markers keep text private, so removing them is an error", () => {
    const text = agents();
    expect(text).toMatch(/private/i);
    expect(text).toMatch(/frontier/i);
  });

  it("lists the frontmatter keys of every kind", () => {
    const text = agents();
    for (const kind of noteKinds) {
      for (const key of requiredKeys(kind)) expect(text, `${kind} ${key}`).toContain(`\`${key}\``);
    }
    for (const area of [
      "health",
      "career",
      "relationships",
      "finance",
      "growth",
      "recreation",
      "social",
      "spirituality",
    ]) {
      expect(text).toContain(area);
    }
  });

  it("forbids editing the launchers and requires running the check after every edit", () => {
    const text = agents();
    expect(text).toContain("Launchers in `_roots/launchers/` are never edited.");
    expect(text).toContain("discretion roots template check");
    expect(text).toMatch(/after every edit/);
    expect(text).toContain("--json");
    expect(text).toContain("discretion roots template diff");
    expect(text).toContain("discretion roots template reset");
  });

  it("says edits apply to notes created later and never to existing ones", () => {
    expect(agents()).toMatch(/existing notes are never re-rendered/i);
    expect(agents()).toContain("discretion roots repair");
  });

  it("agrees with DESIGN.md about the marker table", () => {
    const design = loadDesign();
    for (const name of Object.keys(writers)) {
      expect(design).toContain(`<!-- discretion:${name}:start -->`);
      expect(agents()).toContain(`<!-- discretion:${name}:start -->`);
    }
  });
});
