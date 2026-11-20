function red(): never {
  throw new Error("red");
}

export const noteKinds = ["daily", "weekly", "monthly", "quarterly", "yearly", "home"] as const;
export type NoteKind = (typeof noteKinds)[number];

/** Every file in `_roots/templates/`: the six note templates and the two Templater launchers. */
export const templateNames = [...noteKinds, "today", "repair"] as const;
export type TemplateName = (typeof templateNames)[number];

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

/** The shipped default text of a template. */
export function shippedTemplate(name: TemplateName): string {
  return red() && name;
}

/** The shipped `questions.md`. */
export function shippedQuestions(): string {
  return red();
}

/** The shipped `roots.css`. */
export function shippedCss(): string {
  return red();
}

/** A complete `dataviewjs` block for a query: its preamble, helpers and body. */
export function queryBlock(name: QueryName): string {
  return red() && name;
}
