import { readdirSync, readFileSync } from "node:fs";
import { noteKinds, queryNames, type NoteKind, type QueryName } from "./kinds.js";
import { queryBlockFrom, type Snippets } from "./queries.js";

export { noteKinds, queryNames, type NoteKind, type QueryName };

/** Every file in `_roots/templates/` that is a note template: one per note kind. */
export const templateNames = noteKinds;
export type TemplateName = (typeof templateNames)[number];

/** Every file in `_roots/launchers/`: one per note kind, and the two actions. */
export const launcherNames = [...noteKinds, "today", "repair"] as const;
export type LauncherName = (typeof launcherNames)[number];

/** The whole content of every launcher: a call into the renderer bundle. */
export const launcherText = "<% await tp.user.roots(tp) %>\n";

const asset = (path: string): string =>
  readFileSync(new URL(`../assets/${path}`, import.meta.url), "utf8");

/** The shipped default text of a template. */
export function shippedTemplate(name: TemplateName): string {
  return asset(`templates/${name}.md`);
}

/** The shipped `questions.md`. */
export function shippedQuestions(): string {
  return asset("questions.md");
}

/** The shipped `roots.css`. */
export function shippedCss(): string {
  return asset("roots.css");
}

/** The shipped `_roots/scripts/roots.js`. */
export function shippedBundle(): string {
  return asset("scripts/roots.js");
}

/** The shipped `_roots/templates/AGENTS.md`. */
export function shippedAgents(): string {
  return asset("AGENTS.md");
}

let snippets: Snippets | undefined;

/** The text of every query snippet by name. */
export function shippedSnippets(): Snippets {
  if (snippets !== undefined) return snippets;
  const dir = new URL("../assets/queries/", import.meta.url);
  const out: Snippets = {};
  for (const file of readdirSync(dir).sort()) {
    if (file.endsWith(".dvjs")) out[file.slice(0, -".dvjs".length)] = asset(`queries/${file}`);
  }
  snippets = out;
  return out;
}

/** A complete `dataviewjs` block for a query: its preamble, helpers and body. */
export function queryBlock(name: QueryName): string {
  return queryBlockFrom(shippedSnippets(), name);
}
