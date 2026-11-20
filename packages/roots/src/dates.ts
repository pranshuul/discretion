import type { NoteKind } from "./kinds.js";
import { RootsError } from "./errors.js";

export interface Period {
  from: string;
  to: string;
}

const weekdays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const months = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const pad = (n: number, width = 2): string => String(n).padStart(width, "0");
const msPerDay = 86_400_000;

/** Days since 1970-01-01 of a real calendar date `YYYY-MM-DD`; throws for anything else. */
function toDays(date: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const ms = match ? Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : NaN;
  if (match === null || new Date(ms).toISOString().slice(0, 10) !== date) {
    throw new RootsError(
      "D2013",
      `${JSON.stringify(date)} is not a date.`,
      "Give a real calendar date as YYYY-MM-DD.",
    );
  }
  return ms / msPerDay;
}

const fromDays = (days: number): string => new Date(days * msPerDay).toISOString().slice(0, 10);

/** 0 for Monday to 6 for Sunday. */
const weekdayOf = (days: number): number => (((days + 3) % 7) + 7) % 7;

const parts = (date: string): { y: number; m: number; d: number } => {
  toDays(date);
  return { y: Number(date.slice(0, 4)), m: Number(date.slice(5, 7)), d: Number(date.slice(8, 10)) };
};

/** The ISO 8601 week-year and week number of `date` (`YYYY-MM-DD`). */
export function isoWeekOf(date: string): { year: number; week: number } {
  const days = toDays(date);
  const thursday = days - weekdayOf(days) + 3;
  const year = Number(fromDays(thursday).slice(0, 4));
  const jan1 = toDays(`${pad(year, 4)}-01-01`);
  return { year, week: Math.floor((thursday - jan1) / 7) + 1 };
}

const weeksInYear = (year: number): number => isoWeekOf(`${pad(year, 4)}-12-28`).week;

/** The Monday of ISO week `week` of week-year `year`. */
function mondayOf(year: number, week: number): string {
  const jan4 = toDays(`${pad(year, 4)}-01-04`);
  return fromDays(jan4 - weekdayOf(jan4) + (week - 1) * 7);
}

const lastOfMonth = (y: number, m: number): string => fromDays(Date.UTC(y, m, 1) / msPerDay - 1);

/** The first and last day of the note's period; both are `date` for daily and home. */
export function periodOf(kind: NoteKind, date: string): Period {
  const { y, m } = parts(date);
  switch (kind) {
    case "daily":
    case "home":
      return { from: date, to: date };
    case "weekly": {
      const days = toDays(date);
      const monday = days - weekdayOf(days);
      return { from: fromDays(monday), to: fromDays(monday + 6) };
    }
    case "monthly":
      return { from: `${pad(y, 4)}-${pad(m)}-01`, to: lastOfMonth(y, m) };
    case "quarterly": {
      const first = Math.floor((m - 1) / 3) * 3 + 1;
      return { from: `${pad(y, 4)}-${pad(first)}-01`, to: lastOfMonth(y, first + 2) };
    }
    case "yearly":
      return { from: `${pad(y, 4)}-01-01`, to: `${pad(y, 4)}-12-31` };
  }
}

const quarterOf = (date: string): number => Math.floor((parts(date).m - 1) / 3) + 1;

/** The note's path from the vault root, such as `1-Roots/Daily/2026/11/2026-11-05.md`. */
export function notePath(kind: NoteKind, date: string): string {
  const { y, m } = parts(date);
  const year = pad(y, 4);
  switch (kind) {
    case "daily":
      return `1-Roots/Daily/${year}/${pad(m)}/${date}.md`;
    case "weekly": {
      const week = isoWeekOf(date);
      return `1-Roots/Weekly/${pad(week.year, 4)}/${pad(week.year, 4)}-W${pad(week.week)}.md`;
    }
    case "monthly":
      return `1-Roots/Monthly/${year}/${year}-${pad(m)}.md`;
    case "quarterly":
      return `1-Roots/Quarterly/${year}/${year}-Q${quarterOf(date)}.md`;
    case "yearly":
      return `1-Roots/Yearly/${year}.md`;
    case "home":
      return "1-Roots/Roots.md";
  }
}

/** The text after the `#` of the note's title line. */
export function noteTitle(kind: NoteKind, date: string): string {
  const { y, m, d } = parts(date);
  switch (kind) {
    case "daily":
      return `${weekdays[weekdayOf(toDays(date))]} ${d} ${months[m - 1]} ${y}`;
    case "weekly": {
      const week = isoWeekOf(date);
      return `Week ${week.week}, ${week.year}`;
    }
    case "monthly":
      return `${months[m - 1]} ${y}`;
    case "quarterly":
      return `${y} Q${quarterOf(date)}`;
    case "yearly":
      return String(y);
    case "home":
      return "Roots";
  }
}

const target = (kind: NoteKind, date: string): string => notePath(kind, date).replace(/\.md$/, "");
const link = (kind: NoteKind, date: string, label: string): string =>
  `[[${target(kind, date)}|${label}]]`;
const shift = (date: string, days: number): string => fromDays(toDays(date) + days);

/** The line linking the note's neighbours; empty for home. */
export function noteLinks(kind: NoteKind, date: string): string {
  const { from, to } = periodOf(kind, date);
  const before = shift(from, -1);
  const after = shift(to, 1);
  switch (kind) {
    case "daily":
      return [
        link("daily", before, "← Yesterday"),
        link("weekly", date, "This week"),
        link("daily", after, "Tomorrow →"),
      ].join(" · ");
    case "weekly": {
      const touched = [from, to]
        .map((day) => parts(day))
        .filter((p, at, all) => all.findIndex((q) => q.m === p.m && q.y === p.y) === at)
        .map((p) => link("monthly", `${pad(p.y, 4)}-${pad(p.m)}-01`, `${months[p.m - 1]} ${p.y}`));
      return [
        link("weekly", before, "← Previous week"),
        link("weekly", after, "Next week →"),
        ...touched,
      ].join(" · ");
    }
    case "monthly":
      return [
        link("monthly", before, "← Previous month"),
        link("monthly", after, "Next month →"),
        link("yearly", date, String(parts(date).y)),
      ].join(" · ");
    case "quarterly":
      return [
        link("quarterly", before, "← Previous quarter"),
        link("quarterly", after, "Next quarter →"),
      ].join(" · ");
    case "yearly":
      return [link("yearly", before, "← Previous year"), link("yearly", after, "Next year →")].join(
        " · ",
      );
    case "home":
      return "";
  }
}

/** The first day of the period a note named `name` (no extension) covers, or null. */
export function dateFromName(kind: NoteKind, name: string): string | null {
  const valid = (date: string): string | null => {
    try {
      toDays(date);
      return date;
    } catch {
      return null;
    }
  };
  switch (kind) {
    case "daily":
      return valid(name);
    case "weekly": {
      const match = /^(\d{4})-W(\d{2})$/.exec(name);
      if (match === null) return null;
      const [year, week] = [Number(match[1]), Number(match[2])];
      return week >= 1 && week <= weeksInYear(year) ? mondayOf(year, week) : null;
    }
    case "monthly": {
      const match = /^(\d{4})-(\d{2})$/.exec(name);
      return match !== null && Number(match[2]) >= 1 && Number(match[2]) <= 12
        ? `${name}-01`
        : null;
    }
    case "quarterly": {
      const match = /^(\d{4})-Q([1-4])$/.exec(name);
      return match === null ? null : `${match[1]}-${pad((Number(match[2]) - 1) * 3 + 1)}-01`;
    }
    case "yearly":
      return /^\d{4}$/.test(name) ? `${name}-01-01` : null;
    case "home":
      return null;
  }
}

const daysBefore = [0, 31, 60, 91, 121, 152, 182, 213, 244, 274, 305, 335];

/** The prompt for `date` from the text of `questions.md`, found by leap-year position. */
export function questionFor(questions: string, date: string): string {
  const { m, d } = parts(date);
  const position = (daysBefore[m - 1] as number) + d;
  for (const line of questions.split("\n")) {
    const match = /^(\d+)\. (.+)$/.exec(line);
    if (match !== null && Number(match[1]) === position) return (match[2] as string).trimEnd();
  }
  throw new RootsError(
    "D2011",
    `1-Roots/_roots/questions.md has no question ${position}, the prompt for ${date}.`,
    "Add the missing prompt, or delete questions.md and run discretion roots install to write the default list.",
  );
}
