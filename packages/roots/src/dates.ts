/* eslint-disable @typescript-eslint/no-unused-vars */
import type { NoteKind } from "./assets.js";

export interface Period {
  from: string;
  to: string;
}

/** The ISO 8601 week-year and week number of `date` (`YYYY-MM-DD`). */
export function isoWeekOf(_date: string): { year: number; week: number } {
  throw new Error("red");
}

/** The first and last day of the note's period; both are `date` for daily and home. */
export function periodOf(_kind: NoteKind, _date: string): Period {
  throw new Error("red");
}

/** The note's path from the vault root, such as `1-Roots/Daily/2026/11/2026-11-05.md`. */
export function notePath(_kind: NoteKind, _date: string): string {
  throw new Error("red");
}

/** The text after the `#` of the note's title line. */
export function noteTitle(_kind: NoteKind, _date: string): string {
  throw new Error("red");
}

/** The line linking the note's neighbours; empty for home. */
export function noteLinks(_kind: NoteKind, _date: string): string {
  throw new Error("red");
}

/** The first day of the period a note named `name` (no extension) covers, or null. */
export function dateFromName(_kind: NoteKind, _name: string): string | null {
  throw new Error("red");
}

/** The prompt for `date` from the text of `questions.md`, found by leap-year position. */
export function questionFor(_questions: string, _date: string): string {
  throw new Error("red");
}
