import { queryNames, type QueryName } from "./kinds.js";
import { queryBlockFrom, type Snippets } from "./queries.js";

/** What the renderer supplies to a template. */
export interface TemplateValues {
  title?: string;
  links?: string;
  date?: string;
  question?: string;
  frontmatter?: string;
}

export interface Filled {
  text: string;
  /** Placeholders that are not known or have no value, left in the text as written. */
  unknown: string[];
}

/** The placeholders that take a value from the renderer. */
export const fixedPlaceholders = ["title", "links", "date", "question", "frontmatter"] as const;

/**
 * Fills the placeholders of a template in one pass: `{{title}}`, `{{links}}`, `{{date}}`,
 * `{{question}}`, `{{frontmatter}}` and `{{query:<name>}}`. Everything else is copied as
 * written. A placeholder that is not known, or that has no value, stays in the text as
 * visible `{{name}}` and is reported in `unknown`.
 */
export function fillWith(template: string, values: TemplateValues, snippets: Snippets): Filled {
  const unknown: string[] = [];
  const text = template.replace(/\{\{([^{}\n]+)\}\}/g, (whole, name: string) => {
    let filled: string | undefined;
    if (name.startsWith("query:")) {
      const query = name.slice("query:".length);
      if ((queryNames as readonly string[]).includes(query))
        filled = queryBlockFrom(snippets, query as QueryName);
    } else if ((fixedPlaceholders as readonly string[]).includes(name)) {
      filled = values[name as (typeof fixedPlaceholders)[number]];
    }
    if (filled === undefined) {
      if (!unknown.includes(name)) unknown.push(name);
      return whole;
    }
    return filled;
  });
  return { text, unknown };
}
