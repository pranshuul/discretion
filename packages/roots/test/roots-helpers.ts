import {
  shippedQuestions,
  shippedSnippets,
  shippedTemplate,
  type NoteKind,
} from "../src/assets.js";
import type { RenderContext } from "../src/render.js";

/** The seven fixture dates of the golden files: Monday 2 to Sunday 8 November 2026. */
export const fixtureDates = [
  "2026-11-02",
  "2026-11-03",
  "2026-11-04",
  "2026-11-05",
  "2026-11-06",
  "2026-11-07",
  "2026-11-08",
];

export const kinds: NoteKind[] = ["daily", "weekly", "monthly", "quarterly", "yearly", "home"];

/** The shipped template, questions and snippets as a render context. */
export function shipped(kind: NoteKind): RenderContext {
  return {
    template: shippedTemplate(kind),
    questions: shippedQuestions(),
    snippets: shippedSnippets(),
  };
}
