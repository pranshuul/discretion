/** Reads packages/roots/DESIGN.md and extracts its machine-checkable parts. */
import { readFileSync } from "node:fs";

export function loadDesign(): string {
  return readFileSync(new URL("../DESIGN.md", import.meta.url), "utf8");
}

/** The journal prompts of the "Question list" section, in day-of-year order. */
export function parseQuestions(design: string): string[] {
  const start = design.indexOf("\n## Question list\n");
  if (start < 0) throw new Error("DESIGN.md has no Question list section");
  const prompts: string[] = [];
  for (const line of design.slice(start).split("\n")) {
    const m = /^(\d+)\. (.+)$/.exec(line);
    if (!m) continue;
    if (Number(m[1]) !== prompts.length + 1) throw new Error(`question ${m[1]} out of order`);
    prompts.push(m[2] ?? "");
  }
  return prompts;
}

/** The code of the first `js` block under "### <heading>" in the "Recap queries" section. */
export function querySnippet(design: string, heading: string): string {
  void design;
  void heading;
  throw new Error("red");
}

/** The inlineJS code of the Meta Bind button whose label is `label`, dedented. */
export function buttonCode(design: string, label: string): string {
  void design;
  void label;
  throw new Error("red");
}
