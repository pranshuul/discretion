import { queryNames, queryBlock, type QueryName } from "./assets.js";

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

const fixed = ["title", "links", "date", "question", "frontmatter"] as const;

/**
 * Fills the placeholders of a template in one pass: `{{title}}`, `{{links}}`, `{{date}}`,
 * `{{question}}`, `{{frontmatter}}` and `{{query:<name>}}`. Everything else is copied as
 * written. A placeholder that is not known, or that has no value, stays in the text as
 * visible `{{name}}` and is reported in `unknown`.
 */
export function fillTemplate(template: string, values: TemplateValues): Filled {
  const unknown: string[] = [];
  const text = template.replace(/\{\{([^{}\n]+)\}\}/g, (whole, name: string) => {
    let filled: string | undefined;
    if (name.startsWith("query:")) {
      const query = name.slice("query:".length);
      if ((queryNames as readonly string[]).includes(query))
        filled = queryBlock(query as QueryName);
    } else if ((fixed as readonly string[]).includes(name)) {
      filled = values[name as (typeof fixed)[number]];
    }
    if (filled === undefined) {
      if (!unknown.includes(name)) unknown.push(name);
      return whole;
    }
    return filled;
  });
  return { text, unknown };
}
