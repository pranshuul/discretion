import { describe, expect, it } from "vitest";
import {
  noteKinds,
  queryBlock,
  queryNames,
  shippedCss,
  shippedQuestions,
  shippedTemplate,
  templateNames,
  type NoteKind,
} from "../src/assets.js";
import { buttonCode, fenced, loadDesign, parseQuestions, querySnippet } from "./design-helpers.js";

const design = (): string => loadDesign();

const headings = (text: string): string[] =>
  withoutFences(text)
    .split("\n")
    .filter((l) => l.startsWith("## "))
    .map((l) => l.slice(3));

function withoutFences(text: string): string {
  const out: string[] = [];
  let fence = "";
  for (const line of text.split("\n")) {
    const m = /^(`{3,})/.exec(line);
    if (m) {
      if (!fence) fence = m[1] ?? "";
      else if (line.trim() === fence) fence = "";
      continue;
    }
    if (!fence) out.push(line);
  }
  return out.join("\n");
}

const recapSections = ["Ratings", "Logs", "Days", "Habits", "Wheel of Life"];
const expectedHeadings: Record<NoteKind, string[]> = {
  daily: [
    "Journal",
    "Habits",
    "Today's plan",
    "Quick notes",
    "Captured",
    "Pictures",
    "Rating",
    "Question of the day",
    "On this day",
    "Private",
    "Day ribbon",
  ],
  weekly: [...recapSections, "Summary", "Reflection"],
  monthly: [...recapSections, "Summary", "Reflection"],
  quarterly: [...recapSections, "Notes below", "Summary", "Reflection"],
  yearly: [...recapSections, "Notes below", "Summary", "Reflection"],
  home: ["Today", "This week", "Streaks", "30-day rating trend"],
};

const expectedQueries: Record<NoteKind, string[]> = {
  daily: [],
  weekly: ["ratings-bars", "logs", "days", "habits"],
  monthly: ["ratings-trend", "logs", "days", "heatmap", "wheel-progression"],
  quarterly: ["ratings-trend", "logs", "days", "heatmap", "wheel-progression", "notes-below"],
  yearly: ["ratings-trend", "logs", "days", "heatmap", "wheel-progression", "notes-below"],
  home: ["home-today", "home-week", "home-streaks", "home-trend"],
};

const placeholders = (text: string): string[] =>
  [...text.matchAll(/\{\{([^{}]+)\}\}/g)].map((m) => m[1] ?? "");

describe("the default templates", () => {
  it("are eight files: six note kinds and the today and repair launchers", () => {
    expect([...templateNames]).toEqual([
      "daily",
      "weekly",
      "monthly",
      "quarterly",
      "yearly",
      "home",
      "today",
      "repair",
    ]);
  });

  it("launchers are one line calling the shared renderer", () => {
    expect(shippedTemplate("today")).toBe("<% await tp.user.roots(tp) %>\n");
    expect(shippedTemplate("repair")).toBe("<% await tp.user.roots(tp) %>\n");
  });

  it.each(noteKinds)("%s has the sections DESIGN.md lists, top to bottom", (kind) => {
    expect(headings(shippedTemplate(kind))).toEqual(expectedHeadings[kind]);
  });

  it.each(noteKinds)("%s starts with the frontmatter block and a title", (kind) => {
    const lines = shippedTemplate(kind).split("\n");
    expect(lines[0]).toBe("{{frontmatter}}");
    expect(lines[1]).toBe("");
    expect(lines[2]).toBe("# {{title}}");
    expect(shippedTemplate(kind).endsWith("\n")).toBe(true);
    expect(shippedTemplate(kind).endsWith("\n\n")).toBe(false);
  });

  it.each(noteKinds)("%s uses only the fixed placeholders and the known queries", (kind) => {
    for (const p of placeholders(shippedTemplate(kind))) {
      if (p.startsWith("query:")) expect(queryNames as readonly string[]).toContain(p.slice(6));
      else expect(["title", "links", "date", "question", "frontmatter"]).toContain(p);
    }
  });

  it.each(noteKinds)("%s holds its Recap queries in DESIGN.md's order", (kind) => {
    const found = placeholders(shippedTemplate(kind))
      .filter((p) => p.startsWith("query:"))
      .map((p) => p.slice(6));
    expect(found).toEqual(expectedQueries[kind]);
  });

  it("every kind but home links its neighbours", () => {
    for (const kind of noteKinds) {
      expect(placeholders(shippedTemplate(kind)).includes("links")).toBe(kind !== "home");
    }
  });

  it("the daily template has every marker pair once and the Quick notes end marker", () => {
    const text = shippedTemplate("daily");
    for (const name of [
      "journal",
      "habits",
      "plan",
      "captured",
      "pictures",
      "qa",
      "private",
      "ribbon",
    ]) {
      expect(text.split(`<!-- discretion:${name}:start -->`)).toHaveLength(2);
      expect(text.split(`<!-- discretion:${name}:end -->`)).toHaveLength(2);
    }
    // The buttons' code names the marker too, so count the marker on a line of its own.
    expect(text.split("\n").filter((l) => l === "<!-- roots:quick-notes:end -->")).toHaveLength(1);
    expect(text).not.toContain("discretion:summary");
    expect(text).toContain("INPUT[text(placeholder(Name this day in a few words)):alias]");
    expect(text).toContain(
      "INPUT[slider(minValue(1), maxValue(10), stepSize(1), addLabels):rating]",
    );
    expect(text).toContain("Suggested: `VIEW[{aiRating}]` · `VIEW[{aiAlias}]`");
    expect(text).toContain("> {{question}}");
    expect(text).toContain("![[3-Mycelium/ribbons/{{date}}.svg]]");
  });

  it("the daily template carries DESIGN.md's buttons and On this day query word for word", () => {
    const d = design();
    const text = shippedTemplate("daily");
    for (const label of ["Progress", "Highlight", "Idea", "Accept"]) {
      const code = buttonCode(d, label)
        .split("\n")
        .map((l) => (l ? `      ${l}` : l))
        .join("\n");
      expect(text, label).toContain(`label: ${label}\n`);
      expect(text, label).toContain(code);
    }
    expect(text).toContain(fenced(d, "Daily note", "12. On this day", "dataviewjs"));
  });

  it("the daily template's plan section has no query of its own", () => {
    const text = shippedTemplate("daily");
    const plan = text.slice(text.indexOf("## Today's plan"), text.indexOf("## Quick notes"));
    expect(plan).not.toContain("dataview");
  });

  it.each(["weekly", "monthly", "quarterly", "yearly"] as const)(
    "%s has the summary and reflection pairs and the three prompts for its period",
    (kind) => {
      const text = shippedTemplate(kind);
      for (const name of ["summary", "reflection"]) {
        expect(text.split(`<!-- discretion:${name}:start -->`)).toHaveLength(2);
        expect(text.split(`<!-- discretion:${name}:end -->`)).toHaveLength(2);
      }
      const period = { weekly: "week", monthly: "month", quarterly: "quarter", yearly: "year" }[
        kind
      ];
      expect(text).toContain(`What went well this ${period}?`);
      expect(text).toContain("What got in the way?");
      expect(text).toContain(`What will I do differently next ${period}?`);
    },
  );

  it("only the weekly template has the Wheel of Life sliders, exactly as DESIGN.md has them", () => {
    const sliders = fenced(design(), "Wheel of Life", "", "markdown");
    expect(shippedTemplate("weekly")).toContain(sliders);
    for (const kind of noteKinds) {
      if (kind !== "weekly" && kind !== "daily") {
        expect(shippedTemplate(kind), kind).not.toContain("INPUT[slider");
      }
    }
    expect(shippedTemplate("daily")).toContain("INPUT[slider"); // the rating slider
    expect(shippedTemplate("daily")).not.toContain("wheel.");
  });

  it("no template has a stray placeholder-looking brace pair in code", () => {
    for (const kind of noteKinds) {
      for (const p of placeholders(shippedTemplate(kind))) expect(p).toMatch(/^[a-z]+(:[a-z-]+)?$/);
    }
  });
});

describe("the query blocks", () => {
  const block = (...parts: string[]): string =>
    ["```dataviewjs", parts.join("\n\n"), "```"].join("\n");
  const q = (heading: string): string => querySnippet(design(), heading);
  const mode = (snippet: string, to: string): string =>
    snippet.replace('const mode = "bars";', `const mode = "${to}";`);
  const range = (to: string): string =>
    q("Home preamble").replace('const range = "week";', `const range = "${to}";`);

  it("each is one fenced dataviewjs block assembled from DESIGN.md's snippets", () => {
    expect(queryBlock("ratings-bars")).toBe(block(q("Preamble"), q("Rating chart"), q("Ratings")));
    expect(queryBlock("ratings-trend")).toBe(
      block(q("Preamble"), q("Rating chart"), mode(q("Ratings"), "trend")),
    );
    expect(queryBlock("logs")).toBe(block(q("Preamble"), q("Logs")));
    expect(queryBlock("days")).toBe(block(q("Preamble"), q("Days")));
    expect(queryBlock("habits")).toBe(block(q("Preamble"), q("Streak"), q("Habits")));
    expect(queryBlock("heatmap")).toBe(block(q("Preamble"), q("Heatmap")));
    expect(queryBlock("wheel-progression")).toBe(block(q("Preamble"), q("Wheel progression")));
    expect(queryBlock("notes-below")).toBe(block(q("Preamble"), q("Notes below")));
  });

  it("Home's blocks use the Home preamble with their range", () => {
    expect(queryBlock("home-today")).toBe(block(range("today"), q("Today")));
    expect(queryBlock("home-week")).toBe(block(range("week"), q("Rating chart"), q("Ratings")));
    expect(queryBlock("home-streaks")).toBe(block(range("all"), q("Streak"), q("Streaks")));
    expect(queryBlock("home-trend")).toBe(
      block(range("30 days"), q("Rating chart"), mode(q("Ratings"), "trend")),
    );
  });

  it("the table in DESIGN.md names every query", () => {
    const d = design();
    for (const name of queryNames) expect(d, name).toContain(`{{query:${name}}}`);
  });
});

describe("the shipped files", () => {
  it("roots.css is DESIGN.md's Colours snippet", () => {
    expect(shippedCss()).toBe(`${fenced(design(), "Colours", "", "css")}\n`);
  });

  it("questions.md is the 366 prompts of DESIGN.md, numbered, in order", () => {
    const text = shippedQuestions();
    const prompts = parseQuestions(design());
    expect(prompts).toHaveLength(366);
    const lines = text.split("\n").filter((l) => /^\d+\. /.test(l));
    expect(lines).toEqual(prompts.map((p, i) => `${i + 1}. ${p}`));
    expect(text.endsWith("\n")).toBe(true);
    expect(text.split("\n")[0]).toMatch(/^# /);
  });
});
