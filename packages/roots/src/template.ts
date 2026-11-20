import { fillWith, type Filled, type TemplateValues } from "./fill.js";
import { shippedSnippets } from "./assets.js";

export type { Filled, TemplateValues };

/**
 * Fills the placeholders of a template in one pass: `{{title}}`, `{{links}}`, `{{date}}`,
 * `{{question}}`, `{{frontmatter}}` and `{{query:<name>}}`. Everything else is copied as
 * written. A placeholder that is not known, or that has no value, stays in the text as
 * visible `{{name}}` and is reported in `unknown`.
 */
export function fillTemplate(template: string, values: TemplateValues): Filled {
  return fillWith(template, values, shippedSnippets());
}
