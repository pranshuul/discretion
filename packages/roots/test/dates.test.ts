import { describe, expect, it } from "vitest";
import { shippedQuestions } from "../src/assets.js";
import {
  dateFromName,
  isoWeekOf,
  noteLinks,
  notePath,
  noteTitle,
  periodOf,
  questionFor,
} from "../src/dates.js";
import { loadDesign, parseQuestions } from "./design-helpers.js";

describe("isoWeekOf", () => {
  it.each([
    ["2026-11-02", 2026, 45],
    ["2026-11-08", 2026, 45],
    ["2026-11-09", 2026, 46],
    ["2027-01-01", 2026, 53],
    ["2026-12-28", 2026, 53],
    ["2024-12-30", 2025, 1],
    ["2026-01-01", 2026, 1],
    ["2021-01-03", 2020, 53],
  ])("%s is %i-W%i", (date, year, week) => {
    expect(isoWeekOf(date)).toEqual({ year, week });
  });

  it("rejects a date that does not exist", () => {
    expect(() => isoWeekOf("2026-02-30")).toThrow();
    expect(() => isoWeekOf("nope")).toThrow();
  });
});

describe("periodOf", () => {
  it.each([
    ["daily", "2026-11-05", "2026-11-05", "2026-11-05"],
    ["weekly", "2026-11-05", "2026-11-02", "2026-11-08"],
    ["weekly", "2027-01-01", "2026-12-28", "2027-01-03"],
    ["monthly", "2026-11-05", "2026-11-01", "2026-11-30"],
    ["monthly", "2028-02-10", "2028-02-01", "2028-02-29"],
    ["quarterly", "2026-11-05", "2026-10-01", "2026-12-31"],
    ["quarterly", "2026-02-05", "2026-01-01", "2026-03-31"],
    ["yearly", "2026-11-05", "2026-01-01", "2026-12-31"],
    ["home", "2026-11-05", "2026-11-05", "2026-11-05"],
  ] as const)("%s on %s covers %s to %s", (kind, date, from, to) => {
    expect(periodOf(kind, date)).toEqual({ from, to });
  });
});

describe("notePath", () => {
  it.each([
    ["daily", "2026-11-05", "1-Roots/Daily/2026/11/2026-11-05.md"],
    ["weekly", "2026-11-05", "1-Roots/Weekly/2026/2026-W45.md"],
    ["weekly", "2027-01-01", "1-Roots/Weekly/2026/2026-W53.md"],
    ["weekly", "2024-12-30", "1-Roots/Weekly/2025/2025-W01.md"],
    ["monthly", "2026-11-05", "1-Roots/Monthly/2026/2026-11.md"],
    ["quarterly", "2026-11-05", "1-Roots/Quarterly/2026/2026-Q4.md"],
    ["yearly", "2026-11-05", "1-Roots/Yearly/2026.md"],
    ["home", "2026-11-05", "1-Roots/Roots.md"],
  ] as const)("%s on %s is %s", (kind, date, path) => {
    expect(notePath(kind, date)).toBe(path);
  });
});

describe("noteTitle", () => {
  it.each([
    ["daily", "2026-11-05", "Thursday 5 November 2026"],
    ["daily", "2026-11-01", "Sunday 1 November 2026"],
    ["weekly", "2026-11-05", "Week 45, 2026"],
    ["weekly", "2027-01-01", "Week 53, 2026"],
    ["monthly", "2026-11-05", "November 2026"],
    ["quarterly", "2026-11-05", "2026 Q4"],
    ["yearly", "2026-11-05", "2026"],
    ["home", "2026-11-05", "Roots"],
  ] as const)("%s on %s is %s", (kind, date, title) => {
    expect(noteTitle(kind, date)).toBe(title);
  });
});

describe("noteLinks", () => {
  it("links yesterday, this week and tomorrow in a daily note, by full path", () => {
    expect(noteLinks("daily", "2026-11-05")).toBe(
      "[[1-Roots/Daily/2026/11/2026-11-04|← Yesterday]] · [[1-Roots/Weekly/2026/2026-W45|This week]] · [[1-Roots/Daily/2026/11/2026-11-06|Tomorrow →]]",
    );
  });

  it("crosses a month and a year in a daily note", () => {
    expect(noteLinks("daily", "2026-12-31")).toContain(
      "[[1-Roots/Daily/2027/01/2027-01-01|Tomorrow →]]",
    );
    expect(noteLinks("daily", "2027-01-01")).toContain(
      "[[1-Roots/Weekly/2026/2026-W53|This week]]",
    );
  });

  it("links the previous and next week and the month a weekly note touches", () => {
    expect(noteLinks("weekly", "2026-11-05")).toBe(
      "[[1-Roots/Weekly/2026/2026-W44|← Previous week]] · [[1-Roots/Weekly/2026/2026-W46|Next week →]] · [[1-Roots/Monthly/2026/2026-11|November 2026]]",
    );
  });

  it("lists both months when a week spans two", () => {
    expect(noteLinks("weekly", "2026-11-30")).toBe(
      "[[1-Roots/Weekly/2026/2026-W48|← Previous week]] · [[1-Roots/Weekly/2026/2026-W50|Next week →]] · [[1-Roots/Monthly/2026/2026-11|November 2026]] · [[1-Roots/Monthly/2026/2026-12|December 2026]]",
    );
  });

  it("links the neighbouring weeks across a year end", () => {
    expect(noteLinks("weekly", "2027-01-04")).toContain(
      "[[1-Roots/Weekly/2026/2026-W53|← Previous week]]",
    );
    expect(noteLinks("weekly", "2026-12-28")).toContain(
      "[[1-Roots/Weekly/2027/2027-W01|Next week →]]",
    );
  });

  it("links the previous and next month and the year from a monthly note", () => {
    expect(noteLinks("monthly", "2026-11-05")).toBe(
      "[[1-Roots/Monthly/2026/2026-10|← Previous month]] · [[1-Roots/Monthly/2026/2026-12|Next month →]] · [[1-Roots/Yearly/2026|2026]]",
    );
    expect(noteLinks("monthly", "2026-12-01")).toContain(
      "[[1-Roots/Monthly/2027/2027-01|Next month →]]",
    );
    expect(noteLinks("monthly", "2026-01-01")).toContain(
      "[[1-Roots/Monthly/2025/2025-12|← Previous month]]",
    );
  });

  it("links the previous and next quarter and year", () => {
    expect(noteLinks("quarterly", "2026-11-05")).toBe(
      "[[1-Roots/Quarterly/2026/2026-Q3|← Previous quarter]] · [[1-Roots/Quarterly/2027/2027-Q1|Next quarter →]]",
    );
    expect(noteLinks("yearly", "2026-11-05")).toBe(
      "[[1-Roots/Yearly/2025|← Previous year]] · [[1-Roots/Yearly/2027|Next year →]]",
    );
  });

  it("has no links for home", () => {
    expect(noteLinks("home", "2026-11-05")).toBe("");
  });
});

describe("dateFromName", () => {
  it.each([
    ["daily", "2026-11-05", "2026-11-05"],
    ["weekly", "2026-W45", "2026-11-02"],
    ["weekly", "2026-W53", "2026-12-28"],
    ["weekly", "2025-W01", "2024-12-30"],
    ["monthly", "2026-11", "2026-11-01"],
    ["quarterly", "2026-Q4", "2026-10-01"],
    ["quarterly", "2026-Q1", "2026-01-01"],
    ["yearly", "2026", "2026-01-01"],
  ] as const)("%s %s starts on %s", (kind, name, date) => {
    expect(dateFromName(kind, name)).toBe(date);
  });

  it.each([
    ["daily", "Untitled"],
    ["daily", "2026-02-30"],
    ["daily", "2026-11"],
    ["weekly", "2026-W54"],
    ["weekly", "2025-W53"],
    ["weekly", "2026-W00"],
    ["monthly", "2026-13"],
    ["quarterly", "2026-Q5"],
    ["yearly", "26"],
    ["home", "Roots"],
  ] as const)("%s %s is not a name", (kind, name) => {
    expect(dateFromName(kind, name)).toBeNull();
  });
});

describe("questionFor", () => {
  const questions = shippedQuestions();
  const prompts = parseQuestions(loadDesign());

  it.each([
    ["2026-01-01", 1],
    ["2026-02-28", 59],
    ["2026-03-01", 61],
    ["2028-02-29", 60],
    ["2028-03-01", 61],
    ["2026-11-05", 310],
    ["2026-12-31", 366],
    ["2028-12-31", 366],
  ])("%s is prompt %i, in every year", (date, n) => {
    expect(questionFor(questions, date)).toBe(prompts[n - 1]);
  });

  it("refuses a question list with no prompt for the day", () => {
    expect(() => questionFor("# empty\n", "2026-11-05")).toThrow(/question/i);
  });
});
