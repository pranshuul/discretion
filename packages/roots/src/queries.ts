import type { QueryName } from "./kinds.js";

/** The text of every query snippet by name, as `assets/queries/<name>.dvjs` holds it. */
export type Snippets = Record<string, string>;

/** A snippet of DESIGN.md's Recap queries, without its final newline. */
function snippet(snippets: Snippets, name: string): string {
  const text = snippets[name];
  if (text === undefined) throw new Error(`there is no query snippet ${name}`);
  return text.replace(/\n$/, "");
}

/** `source` with its one `const <name> = "<default>";` line set to `value`. */
function setting(source: string, name: string, fallback: string, value: string): string {
  const line = `const ${name} = "${fallback}";`;
  if (!source.includes(line)) throw new Error(`snippet has no ${line}`);
  return source.replace(line, `const ${name} = "${value}";`);
}

const block = (...parts: string[]): string =>
  ["```dataviewjs", parts.join("\n\n"), "```"].join("\n");

/** A complete `dataviewjs` block for a query: its preamble, helpers and body. */
export function queryBlockFrom(snippets: Snippets, name: QueryName): string {
  const s = (part: string): string => snippet(snippets, part);
  const home = (range: string): string => setting(s("home-preamble"), "range", "week", range);
  const trend = (): string => setting(s("ratings"), "mode", "bars", "trend");
  switch (name) {
    case "ratings-bars":
      return block(s("preamble"), s("rating-chart"), s("ratings"));
    case "ratings-trend":
      return block(s("preamble"), s("rating-chart"), trend());
    case "logs":
      return block(s("preamble"), s("logs"));
    case "days":
      return block(s("preamble"), s("days"));
    case "habits":
      return block(s("preamble"), s("streak"), s("habits"));
    case "heatmap":
      return block(s("preamble"), s("heatmap"));
    case "wheel-progression":
      return block(s("preamble"), s("wheel-progression"));
    case "notes-below":
      return block(s("preamble"), s("notes-below"));
    case "home-today":
      return block(home("today"), s("today"));
    case "home-week":
      return block(home("week"), s("rating-chart"), s("ratings"));
    case "home-streaks":
      return block(home("all"), s("streak"), s("streaks"));
    case "home-trend":
      return block(home("30 days"), s("rating-chart"), trend());
  }
}
