/* eslint-disable @typescript-eslint/no-unused-vars */
import type { NoteKind } from "./assets.js";

/** The kind and date of the note at `path`, from its name or else its frontmatter. */
export function identifyNote(
  _path: string,
  _text: string,
): { kind: NoteKind; date: string } | null {
  throw new Error("red");
}

/** `fresh` with everything Pranshul wrote in `existing` carried over; nothing is dropped. */
export function repairText(_existing: string, _fresh: string): string {
  throw new Error("red");
}
