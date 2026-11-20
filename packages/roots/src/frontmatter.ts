/* eslint-disable @typescript-eslint/no-unused-vars */
import type { NoteKind } from "./assets.js";

/** One top-level key of a frontmatter block with the lines that belong to it. */
export interface FrontmatterBlock {
  key: string;
  lines: string[];
}

export interface ParsedFrontmatter {
  /** Whether the text starts with a frontmatter fence. */
  present: boolean;
  blocks: FrontmatterBlock[];
  /** Everything after the closing fence. */
  body: string;
  /** Why the block cannot be read, or null. */
  error: string | null;
}

/** The frontmatter block, fences included, of a freshly rendered note. */
export function frontmatterFor(_kind: NoteKind, _date: string): string {
  throw new Error("red");
}

/** Reads a frontmatter block without a YAML library; reports what it cannot read. */
export function parseFrontmatter(_text: string): ParsedFrontmatter {
  throw new Error("red");
}

/** The keys a note kind's frontmatter must have. */
export function requiredKeys(_kind: NoteKind): string[] {
  throw new Error("red");
}

/** `fresh`'s keys with `existing`'s values; keys only `existing` has are kept at the end. */
export function mergeFrontmatter(_existing: ParsedFrontmatter, _fresh: ParsedFrontmatter): string {
  throw new Error("red");
}
