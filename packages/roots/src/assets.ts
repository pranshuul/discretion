import { readFileSync } from "node:fs";

export const noteKinds = ["daily", "weekly", "monthly", "quarterly", "yearly", "home"] as const;
export type NoteKind = (typeof noteKinds)[number];

/** Every file in `_roots/templates/`: the six note templates and the two Templater launchers. */
export const templateNames = [...noteKinds, "today", "repair"] as const;
export type TemplateName = (typeof templateNames)[number];

/** The names `{{query:<name>}}` accepts. */
export const queryNames = [
  "ratings-bars",
  "ratings-trend",
  "logs",
  "days",
  "habits",
  "heatmap",
  "wheel-progression",
  "notes-below",
  "home-today",
  "home-week",
  "home-streaks",
  "home-trend",
] as const;
export type QueryName = (typeof queryNames)[number];

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

/** A snippet of DESIGN.md's Recap queries, without its final newline. */
const snippet = (name: string): string => asset(`queries/${name}.dvjs`).replace(/\n$/, "");

/** `source` with its one `const <name> = "<default>";` line set to `value`. */
function setting(source: string, name: string, fallback: string, value: string): string {
  const line = `const ${name} = "${fallback}";`;
  if (!source.includes(line)) throw new Error(`snippet has no ${line}`);
  return source.replace(line, `const ${name} = "${value}";`);
}

const block = (...parts: string[]): string =>
  ["```dataviewjs", parts.join("\n\n"), "```"].join("\n");

const home = (range: string): string => setting(snippet("home-preamble"), "range", "week", range);
const trend = (): string => setting(snippet("ratings"), "mode", "bars", "trend");

/** A complete `dataviewjs` block for a query: its preamble, helpers and body. */
export function queryBlock(name: QueryName): string {
  switch (name) {
    case "ratings-bars":
      return block(snippet("preamble"), snippet("rating-chart"), snippet("ratings"));
    case "ratings-trend":
      return block(snippet("preamble"), snippet("rating-chart"), trend());
    case "logs":
      return block(snippet("preamble"), snippet("logs"));
    case "days":
      return block(snippet("preamble"), snippet("days"));
    case "habits":
      return block(snippet("preamble"), snippet("streak"), snippet("habits"));
    case "heatmap":
      return block(snippet("preamble"), snippet("heatmap"));
    case "wheel-progression":
      return block(snippet("preamble"), snippet("wheel-progression"));
    case "notes-below":
      return block(snippet("preamble"), snippet("notes-below"));
    case "home-today":
      return block(home("today"), snippet("today"));
    case "home-week":
      return block(home("week"), snippet("rating-chart"), snippet("ratings"));
    case "home-streaks":
      return block(home("all"), snippet("streak"), snippet("streaks"));
    case "home-trend":
      return block(home("30 days"), snippet("rating-chart"), trend());
  }
}
