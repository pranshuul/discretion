/* eslint-disable @typescript-eslint/no-unused-vars */
import type { NoteKind } from "./assets.js";

export interface NewNoteOptions {
  vault: string;
  kind: NoteKind;
  date: string;
  dryRun?: boolean;
}

export interface NewNoteResult {
  path: string;
  created: boolean;
}

/** Writes the note unless it exists; an existing note is never rendered again. */
export async function newNote(_options: NewNoteOptions): Promise<NewNoteResult> {
  throw new Error("red");
}

export interface RepairOptions {
  vault: string;
  /** A note path, or a date: `YYYY-MM-DD`, `YYYY-Www`, `YYYY-MM`, `YYYY-Qn` or `YYYY`. */
  target: string;
  dryRun?: boolean;
}

export interface RepairResult {
  path: string;
  changed: boolean;
  diff: string;
}

/** Repairs one note from the current template; commits the vault before and after. */
export async function repairNote(_options: RepairOptions): Promise<RepairResult> {
  throw new Error("red");
}
