function red(): never {
  throw new Error("red");
}

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

/** Fills the placeholders of a template in one pass. */
export function fillTemplate(template: string, values: TemplateValues): Filled {
  return red() && { text: template + String(values.title), unknown: [] };
}
