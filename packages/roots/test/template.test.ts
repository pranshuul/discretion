import { describe, expect, it } from "vitest";
import { queryBlock } from "../src/assets.js";
import { noteKinds, shippedTemplate } from "../src/assets.js";
import { fillTemplate } from "../src/template.js";

const values = {
  title: "Thursday 5 November 2026",
  links: "[[a|Yesterday]]",
  date: "2026-11-05",
  question: "What did today teach you?",
  frontmatter: "---\nroots: 1\n---",
};

describe("fillTemplate", () => {
  it("fills every placeholder wherever it appears", () => {
    const { text, unknown } = fillTemplate(
      "{{frontmatter}}\n# {{title}}\n{{links}}\n> {{question}}\n{{date}} {{date}}",
      values,
    );
    expect(unknown).toEqual([]);
    expect(text).toBe(
      "---\nroots: 1\n---\n# Thursday 5 November 2026\n[[a|Yesterday]]\n> What did today teach you?\n2026-11-05 2026-11-05",
    );
  });

  it("expands {{query:<name>}} to the query's block", () => {
    const { text, unknown } = fillTemplate("a\n\n{{query:logs}}\n\nb", {});
    expect(unknown).toEqual([]);
    expect(text).toBe(`a\n\n${queryBlock("logs")}\n\nb`);
  });

  it("leaves an unknown placeholder as visible text and reports it", () => {
    const { text, unknown } = fillTemplate("x {{mood}} y {{query:nope}} z {{mood}}", values);
    expect(text).toBe("x {{mood}} y {{query:nope}} z {{mood}}");
    expect(unknown).toEqual(["mood", "query:nope"]);
  });

  it("treats a known placeholder with no value as unknown", () => {
    const { text, unknown } = fillTemplate("{{title}} {{question}}", { title: "T" });
    expect(text).toBe("T {{question}}");
    expect(unknown).toEqual(["question"]);
  });

  it("does not rescan what it inserted, or treat $ patterns specially", () => {
    const { text, unknown } = fillTemplate("{{title}}|{{links}}", {
      title: "Cost $& and $1 {{date}}",
      links: "$`",
    });
    expect(text).toBe("Cost $& and $1 {{date}}|$`");
    expect(unknown).toEqual([]);
  });

  it("copies everything else exactly, including single braces and Templater tags", () => {
    const source = "VIEW[{aiRating}] <% tp.date.now() %> ${x} {not}\n";
    expect(fillTemplate(source, values).text).toBe(source);
  });

  it.each(noteKinds)("every shipped %s template fills with nothing left over", (kind) => {
    const { text, unknown } = fillTemplate(shippedTemplate(kind), values);
    expect(unknown).toEqual([]);
    expect(text).not.toMatch(/\{\{[^}]*\}\}/);
  });
});
