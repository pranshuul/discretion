/* eslint-disable @typescript-eslint/no-unused-vars */
import type { NoteKind } from "./assets.js";

/** The text of every query snippet by name, as `assets/queries/<name>.dvjs` holds it. */
export type Snippets = Record<string, string>;

/** What the renderer may not read itself. */
export interface RenderContext {
  template: string;
  questions: string;
  snippets: Snippets;
}

export interface Rendered {
  text: string;
  /** Placeholders that are not known, left in the text as written. */
  unknown: string[];
}

/** Reads a vault-relative file as text, or null when it does not exist. */
export type Reader = (path: string) => Promise<string | null>;

export const questionsPath = "1-Roots/_roots/questions.md";

/** Where a note kind's template lives in the vault. */
export function templatePath(_kind: NoteKind): string {
  throw new Error("red");
}

/** The note's full text, and the placeholders it could not fill. */
export function renderReport(_kind: NoteKind, _date: string, _ctx: RenderContext): Rendered {
  throw new Error("red");
}

/** The note's full text for `kind` on `date`: deterministic, `\n` lines, a final newline. */
export function render(_kind: NoteKind, _date: string, _ctx: RenderContext): string {
  throw new Error("red");
}

/** Reads the template and questions through `read`, then renders. */
export async function renderNote(
  _kind: NoteKind,
  _date: string,
  _read: Reader,
  _snippets: Snippets,
): Promise<string> {
  throw new Error("red");
}
