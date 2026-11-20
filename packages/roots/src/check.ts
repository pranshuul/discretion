/* eslint-disable @typescript-eslint/no-unused-vars */
import type { NoteKind } from "./assets.js";
import type { RenderContext } from "./render.js";

export interface Problem {
  severity: "error" | "warning";
  /** The file the problem is in, such as `daily.md`. */
  file: string;
  line: number | null;
  code: string;
  message: string;
  fix: string;
}

/** Validates one template's text; nothing is read or written. */
export function checkTemplateText(
  _kind: NoteKind,
  _text: string,
  _ctx: Omit<RenderContext, "template">,
  _today: string,
): Problem[] {
  throw new Error("red");
}

export interface CheckOptions {
  vault: string;
  kind?: NoteKind;
  today?: string;
}

/** Validates the templates and launchers in the vault. */
export function checkTemplates(_options: CheckOptions): Problem[] {
  throw new Error("red");
}
