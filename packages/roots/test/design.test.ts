import { describe, expect, it } from "vitest";
import { loadDesign, parseQuestions } from "../src/design.js";

const design = (): string => loadDesign();

/** Text of the "## <title>" section, up to the next level-2 heading. */
function section(text: string, title: string): string {
  const start = text.indexOf(`\n## ${title}\n`);
  expect(start, `section ${title}`).toBeGreaterThanOrEqual(0);
  const rest = text.slice(start + 1);
  const next = rest.indexOf("\n## ", 1);
  return next < 0 ? rest : rest.slice(0, next);
}

/** Level-3 headings of a section, in order. */
function headings(text: string): string[] {
  return [...text.matchAll(/^### (.+)$/gm)].map((m) => m[1] ?? "");
}

describe("Roots DESIGN.md", () => {
  it("has the top-level sections in order", () => {
    const titles = [...design().matchAll(/^## (.+)$/gm)].map((m) => m[1]);
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
    expect(buttons).toContain("type: button");
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
