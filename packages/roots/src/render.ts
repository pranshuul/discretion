import { noteLinks, noteTitle, periodOf, questionFor } from "./dates.js";
import { RootsError } from "./errors.js";
import { fillWith } from "./fill.js";
import { frontmatterFor } from "./frontmatter.js";
import type { NoteKind } from "./kinds.js";
import type { Snippets } from "./queries.js";

export type { Snippets } from "./queries.js";

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
export function templatePath(kind: NoteKind): string {
  return `1-Roots/_roots/templates/${kind}.md`;
}

/** The note's full text, and the placeholders it could not fill. */
export function renderReport(kind: NoteKind, date: string, ctx: RenderContext): Rendered {
  const template = ctx.template.replace(/\r\n?/g, "\n");
  const { from } = periodOf(kind, date);
  const filled = fillWith(
    template,
    {
      title: noteTitle(kind, date),
      links: noteLinks(kind, date),
      date: kind === "daily" || kind === "home" ? date : from,
      question: template.includes("{{question}}") ? questionFor(ctx.questions, date) : "",
      frontmatter: frontmatterFor(kind, date),
    },
    ctx.snippets,
  );
  return { text: `${filled.text.replace(/\n+$/, "")}\n`, unknown: filled.unknown };
}

/** The note's full text for `kind` on `date`: deterministic, `\n` lines, a final newline. */
export function render(kind: NoteKind, date: string, ctx: RenderContext): string {
  return renderReport(kind, date, ctx).text;
}

/** Reads the template and questions through `read`, then renders. */
export async function renderNote(
  kind: NoteKind,
  date: string,
  read: Reader,
  snippets: Snippets,
): Promise<string> {
  const template = await read(templatePath(kind));
  const questions = await read(questionsPath);
  const missing =
    template === null ? templatePath(kind) : questions === null ? questionsPath : null;
  if (missing !== null || template === null || questions === null) {
    throw new RootsError(
      "D2011",
      `${missing ?? templatePath(kind)} is missing, so the ${kind} note cannot be rendered.`,
      "Run discretion roots install to lay out Roots in the vault.",
    );
  }
  return render(kind, date, { template, questions, snippets });
}
