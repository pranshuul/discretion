export const noteKinds = ["daily", "weekly", "monthly", "quarterly", "yearly", "home"] as const;
export type NoteKind = (typeof noteKinds)[number];

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
