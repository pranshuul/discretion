import { describe, expect, it } from "vitest";
import * as roots from "../src/index.js";
import { loadDesign, parseQuestions } from "./design-helpers.js";

const design = (): string => loadDesign();

/** Lines outside fenced code blocks, with their index. */
function proseLines(text: string): { line: string; at: number }[] {
  const out: { line: string; at: number }[] = [];
  let fence = "";
  text.split("\n").forEach((line, at) => {
    const m = /^(`{3,})/.exec(line);
    if (m) {
      if (!fence) fence = m[1] ?? "";
      else if (line.trim() === fence) fence = "";
      return;
    }
    if (!fence) out.push({ line, at });
  });
  return out;
}

/** Text of the "## <title>" section, up to the next level-2 heading outside code. */
function section(text: string, title: string): string {
  const lines = text.split("\n");
  const heads = proseLines(text).filter((l) => l.line.startsWith("## "));
  const i = heads.findIndex((l) => l.line === `## ${title}`);
  expect(i, `section ${title}`).toBeGreaterThanOrEqual(0);
  const from = heads[i]?.at ?? 0;
  const to = heads[i + 1]?.at ?? lines.length;
  return lines.slice(from, to).join("\n");
}

/** Level-3 headings of a section outside code, in order. */
function headings(text: string): string[] {
  return proseLines(text)
    .filter((l) => l.line.startsWith("### "))
    .map((l) => l.line.slice(4));
}

describe("Roots DESIGN.md", () => {
  it("has the top-level sections in order", () => {
    const titles = proseLines(design())
      .filter((l) => l.line.startsWith("## "))
      .map((l) => l.line.slice(3));
    expect(titles).toEqual([
      "Notes and paths",
      "Plugins",
      "Daily note",
      "Weekly note",
      "Monthly note",
      "Quarterly note",
      "Yearly note",
      "Home note",
      "Buttons",
      "Recap queries",
      "Wheel of Life",
      "Colours",
      "One renderer",
      "Marker rules",
      "Privacy spans",
      "Question list",
    ]);
  });

  it("lists the daily note's fourteen parts top to bottom", () => {
    const daily = section(design(), "Daily note");
    expect(headings(daily)).toEqual([
      "1. Frontmatter",
      "2. Title and links",
      "3. Alias input",
      "4. Journal",
      "5. Habits",
      "6. Today's plan",
      "7. Quick notes",
      "8. Captured",
      "9. Pictures",
      "10. Rating",
      "11. Question of the day",
      "12. On this day",
      "13. Private",
      "14. Day ribbon",
    ]);
    for (const key of ["roots: 1", "date:", "rating:", "alias:", "aiRating:", "aiAlias:"]) {
      expect(daily).toContain(key);
    }
    for (const key of [
      "discretion: 1",
      "habits:",
      "habitMinutes:",
      "habitSource:",
      "skipReasons:",
    ]) {
      expect(daily).toContain(key);
    }
  });

  it("gives every recap kind the same top-to-bottom sections", () => {
    const d = design();
    const weekly = ["Ratings", "Logs", "Days", "Habits", "Wheel of Life", "Summary", "Reflection"];
    expect(headings(section(d, "Weekly note"))).toEqual(weekly);
    for (const kind of ["Monthly", "Quarterly", "Yearly"]) {
      const parts = headings(section(d, `${kind} note`));
      expect(parts).toEqual(
        kind === "Monthly"
          ? weekly
          : [
              "Ratings",
              "Logs",
              "Days",
              "Habits",
              "Wheel of Life",
              "Notes below",
              "Summary",
              "Reflection",
            ],
      );
    }
  });

  it("defines the paths, markers and privacy spans", () => {
    const d = design();
    for (const p of [
      "Daily/YYYY/MM/YYYY-MM-DD.md",
      "Weekly/YYYY/YYYY-[W]WW.md",
      "Monthly/YYYY/YYYY-MM.md",
      "Quarterly/YYYY/YYYY-[Q]Q.md",
      "Yearly/YYYY.md",
      "Roots.md",
    ]) {
      expect(d).toContain(p);
    }
    for (const span of [
      "journal",
      "habits",
      "plan",
      "captured",
      "pictures",
      "qa",
      "private",
      "ribbon",
      "summary",
      "reflection",
    ]) {
      expect(d).toContain(`<!-- discretion:${span}:start -->`);
      expect(d).toContain(`<!-- discretion:${span}:end -->`);
    }
    expect(d).toContain("<!-- roots:quick-notes:end -->");
    const privacy = section(d, "Privacy spans");
    for (const s of [
      "journal",
      "pictures",
      "qa",
      "private",
      "reflection",
      "summary",
      "skipReasons",
      "aiAlias",
    ]) {
      expect(privacy).toContain(s);
    }
  });

  it("defines the three quick-note buttons and the Accept button", () => {
    const buttons = section(design(), "Buttons");
    for (const t of [" - #progress  ", " - #highlight  ", " - #idea  "]) {
      expect(buttons).toContain("`" + t + "`");
    }
    expect(buttons).toContain("Accept");
    expect(buttons.match(/```meta-bind-button/g)).toHaveLength(4);
  });

  it("defines the eight Wheel of Life areas", () => {
    const wheel = section(design(), "Wheel of Life");
    for (const a of [
      "health",
      "career",
      "relationships",
      "finance",
      "growth",
      "recreation",
      "social",
      "spirituality",
    ]) {
      expect(wheel).toContain(`wheel.${a}`);
    }
  });

  it("puts the Wheel of Life sliders and wheel: frontmatter only in weekly notes", () => {
    const d = design();
    const weekly = section(d, "Weekly note");
    expect(weekly).toContain("`wheel:`");
    expect(weekly).toMatch(/slider/i);
    for (const kind of ["Monthly", "Quarterly", "Yearly"]) {
      const s = section(d, `${kind} note`);
      expect(s, kind).not.toContain("`wheel:`");
      expect(s, kind).not.toMatch(/slider/i);
      expect(s, kind).toContain("Wheel progression");
    }
    const wheel = section(d, "Wheel of Life");
    expect(wheel).toContain("Thursday");
    expect(wheel).not.toMatch(/monthly, quarterly and yearly notes hold their own sliders/);
  });

  it("lists DataviewJS as a required setting that install writes", () => {
    const plugins = section(design(), "Plugins");
    expect(plugins).toContain("enableDataviewJs: true");
    expect(plugins).toContain("enableInlineDataviewJs: true");
    expect(plugins).toMatch(/discretion roots install` writes/);
  });

  it("keeps DESIGN.md parsing out of the package's public API", () => {
    expect(Object.keys(roots)).toEqual([]);
  });

  it("defines the recap queries and the colours", () => {
    const d = design();
    const q = section(d, "Recap queries");
    for (const k of [
      "Ratings",
      "Logs",
      "Days",
      "Habits",
      "Heatmap",
      "Wheel progression",
      "Notes below",
    ]) {
      expect(q).toContain(`### ${k}`);
    }
    expect(q).toContain("dataviewjs");
    const colours = section(d, "Colours");
    for (const c of ["done", "skipped", "missed", "pending", "future"]) {
      expect(colours).toContain(`--roots-${c}`);
    }
  });

  it("has 366 distinct original prompts", () => {
    const qs = parseQuestions(design());
    expect(qs).toHaveLength(366);
    expect(new Set(qs).size).toBe(366);
    for (const q of qs) expect(q.endsWith("?") || q.endsWith(".")).toBe(true);
  });

  it("names no Time Garden material", () => {
    expect(design().toLowerCase()).not.toContain("time garden");
  });
});
