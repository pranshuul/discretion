import { describe, expect, it } from "vitest";
import { render } from "../src/render.js";
import { identifyNote, repairText } from "../src/repair.js";
import { shipped } from "./roots-helpers.js";

const daily = (): string => render("daily", "2026-11-05", shipped("daily"));
const weekly = (): string => render("weekly", "2026-11-05", shipped("weekly"));

/** `text` with `from` replaced by `to`, which must occur exactly once. */
function swap(text: string, from: string, to: string): string {
  expect(text.split(from).length, `"${from}" occurs once`).toBe(2);
  return text.replace(from, () => to);
}

/** `text` without the section whose heading line is `heading`, up to the next `## ` heading. */
function without(text: string, heading: string): string {
  const start = text.indexOf(`\n${heading}\n`);
  expect(start).toBeGreaterThanOrEqual(0);
  const next = text.indexOf("\n## ", start + heading.length + 2);
  return text.slice(0, start) + (next < 0 ? "\n" : text.slice(next));
}

describe("repairText", () => {
  it("returns an unchanged note byte for byte", () => {
    expect(repairText(daily(), daily())).toBe(daily());
    expect(repairText(weekly(), weekly())).toBe(weekly());
  });

  it("restores a deleted section and keeps what was written elsewhere", () => {
    let note = swap(
      daily(),
      "<!-- discretion:journal:start -->\n\n<!-- discretion:journal:end -->",
      "<!-- discretion:journal:start -->\nToday I wrote this.\n\nTwo paragraphs.\n<!-- discretion:journal:end -->",
    );
    note = swap(
      note,
      "<!-- discretion:qa:start -->\n\n<!-- discretion:qa:end -->",
      "<!-- discretion:qa:start -->\nMy answer.\n<!-- discretion:qa:end -->",
    );
    note = without(note, "## Captured");
    expect(note).not.toContain("discretion:captured");
    const repaired = repairText(note, daily());
    expect(repaired).toContain("## Captured\n\n<!-- discretion:captured:start -->");
    expect(repaired).toContain(
      "<!-- discretion:journal:start -->\nToday I wrote this.\n\nTwo paragraphs.\n<!-- discretion:journal:end -->",
    );
    expect(repaired).toContain(
      "<!-- discretion:qa:start -->\nMy answer.\n<!-- discretion:qa:end -->",
    );
    expect(repaired).not.toContain("## Recovered");
    expect(repaired.indexOf("## Captured")).toBeLessThan(repaired.indexOf("## Pictures"));
  });

  it("keeps a habit line whose heading and markers were deleted, and restores both", () => {
    const note = swap(
      daily(),
      "## Habits\n\n<!-- discretion:habits:start -->\n<!-- discretion:habits:end -->\n",
      "- Gym INPUT[inlineSelect(option(pending), option(done)):habits.gym]\n",
    );
    const repaired = repairText(note, daily());
    expect(repaired).toContain(
      "## Habits\n\n<!-- discretion:habits:start -->\n<!-- discretion:habits:end -->",
    );
    expect(repaired).toContain(
      "- Gym INPUT[inlineSelect(option(pending), option(done)):habits.gym]",
    );
    expect(repaired.split("- Gym INPUT").length).toBe(2);
  });

  it("carries every frontmatter value over, key by key", () => {
    const note = swap(
      daily(),
      "rating:\nalias:\naiRating:\naiAlias:\ndiscretion: 1\nhabits: {}\nhabitTimes: {}",
      'rating: 7\nalias: "A good day"\naiRating: 6\naiAlias: fine\ndiscretion: 1\nhabits:\n  gym: done\n  meds: delayed\nhabitTimes:\n  meds: "11:05"',
    );
    const text = repairText(note, daily());
    expect(
      text.startsWith(
        '---\nroots: 1\ndate: 2026-11-05\nrating: 7\nalias: "A good day"\naiRating: 6\naiAlias: fine\ndiscretion: 1\nhabits:\n  gym: done\n  meds: delayed\nhabitTimes:\n  meds: "11:05"\nhabitMinutes: {}\n',
      ),
    ).toBe(true);
  });

  it("restores a frontmatter key that was deleted and keeps keys the template lacks", () => {
    const note = swap(
      swap(daily(), "skipReasons: {}\n", "tags:\n  - one\n  - two\nmine: yes\n"),
      "habitSource: {}\n",
      "",
    );
    const text = repairText(note, daily());
    expect(text).toContain("habitSource: {}\n");
    expect(text).toContain("skipReasons: {}\n");
    expect(text).toContain("\ntags:\n  - one\n  - two\nmine: yes\n---\n");
  });

  it("restores the wheel areas of a weekly note without losing the ones that were set", () => {
    const note = swap(
      weekly(),
      "wheel:\n  health:\n  career:\n  relationships:\n  finance:\n  growth:\n  recreation:\n  social:\n  spirituality:\n",
      "wheel:\n  health: 7\n  growth: 4\n",
    );
    const text = repairText(note, weekly());
    expect(text).toContain(
      "wheel:\n  health: 7\n  career:\n  relationships:\n  finance:\n  growth: 4\n  recreation:\n  social:\n  spirituality:\n---",
    );
  });

  it("takes the whole fresh frontmatter when the note has none, and keeps the body", () => {
    const body = daily().slice(daily().indexOf("# Thursday"));
    const text = repairText(`${body}\nExtra line I typed.\n`, daily());
    expect(text.startsWith("---\nroots: 1\ndate: 2026-11-05\n")).toBe(true);
    expect(text).toContain("Extra line I typed.");
  });

  it("recovers frontmatter it cannot read, instead of dropping it", () => {
    const note = swap(daily(), "rating:\nalias:\n", "rating: 7\n\talias: oops\nwhat is this\n");
    const text = repairText(note, daily());
    expect(text.startsWith("---\nroots: 1\ndate: 2026-11-05\nrating:\nalias:\n")).toBe(true);
    expect(text).toContain("## Recovered");
    expect(text).toContain("rating: 7");
    expect(text).toContain("what is this");
  });

  it("carries the quick-notes lines above the end marker", () => {
    const note = swap(
      daily(),
      "\n<!-- roots:quick-notes:end -->\n",
      "\n - #progress  wrote the renderer\n - #idea  a journal for plants #captured ^cap-20261105-x2b8pd\n<!-- roots:quick-notes:end -->\n",
    );
    const text = repairText(note, daily());
    expect(text).toContain(
      " - #progress  wrote the renderer\n - #idea  a journal for plants #captured ^cap-20261105-x2b8pd\n<!-- roots:quick-notes:end -->\n",
    );
    expect(text.split("wrote the renderer")).toHaveLength(2);
  });

  it("keeps quick-notes lines in order after the Quick notes heading was renamed", () => {
    const note = swap(
      swap(
        daily(),
        "\n<!-- roots:quick-notes:end -->\n",
        "\n - #highlight  met a friend\n<!-- roots:quick-notes:end -->\n",
      ),
      "## Quick notes",
      "## Notes to self",
    );
    const text = repairText(note, daily());
    expect(text).toContain(" - #highlight  met a friend\n<!-- roots:quick-notes:end -->");
    expect(text).toContain("## Quick notes");
  });

  it("puts text Pranshul wrote under a heading at the end of that heading's section", () => {
    const note = swap(
      daily(),
      "## Rating\n",
      "## Rating\n\nI thought hard about this score.\nIt was a middling day.\n",
    );
    const text = repairText(note, daily());
    const at = text.indexOf("I thought hard about this score.\nIt was a middling day.");
    expect(at).toBeGreaterThan(text.indexOf("## Rating\n"));
    expect(at).toBeLessThan(text.indexOf("## Question of the day"));
    expect(text.split("I thought hard").length).toBe(2);
  });

  it("recovers text under a heading the template no longer has", () => {
    const note = `${daily()}\n## My own section\n\nLine one.\nLine two.\n`;
    const text = repairText(note, daily());
    expect(text.endsWith("## Recovered\n\n### My own section\n\nLine one.\nLine two.\n")).toBe(
      true,
    );
  });

  it("recovers a marker pair's content when the template has no such pair", () => {
    const fresh = swap(
      daily(),
      "## Pictures\n\n<!-- discretion:pictures:start -->\n\n<!-- discretion:pictures:end -->\n\n",
      "",
    );
    const note = swap(
      daily(),
      "<!-- discretion:pictures:start -->\n\n<!-- discretion:pictures:end -->",
      "<!-- discretion:pictures:start -->\n![[holiday.jpg]]\n<!-- discretion:pictures:end -->",
    );
    const text = repairText(note, fresh);
    expect(text).toContain("## Recovered");
    expect(text).toContain("![[holiday.jpg]]");
  });

  it("carries a pair's content as it is, prompts included", () => {
    const note = swap(
      weekly(),
      "What went well this week?\n\nWhat got in the way?",
      "What went well this week?\n\nA lot of things.\n\nWhat got in the way?",
    );
    const text = repairText(note, weekly());
    expect(text).toContain("A lot of things.");
    expect(text).toBe(note);
  });

  it("gives a pair that was emptied the template's content again", () => {
    const note = swap(
      weekly(),
      "What went well this week?\n\nWhat got in the way?\n\nWhat will I do differently next week?\n",
      "",
    );
    expect(repairText(note, weekly())).toBe(weekly());
  });

  it("never leaves a Recovered section out of order and never duplicates one", () => {
    const note = `${daily()}\n## My own section\n\nKept.\n`;
    const once = repairText(note, daily());
    const twice = repairText(once, daily());
    expect(twice).toBe(once);
    expect(once.match(/## Recovered/g)).toHaveLength(1);
  });

  it("is idempotent across a messy note", () => {
    let note = without(daily(), "## Today's plan");
    note = swap(note, "## Rating\n", "## Rating\n\nExtra under rating.\n");
    note = swap(
      note,
      "\n<!-- roots:quick-notes:end -->\n",
      "\n - #progress  a\n\n - #idea  b\n<!-- roots:quick-notes:end -->\n",
    );
    note = `${note}\n## Elsewhere\n\nStray.\n\n\n\nMore stray.\n`;
    note = swap(note, "alias:\n", "alias: x\nextra: 1\n");
    const once = repairText(note, daily());
    expect(repairText(once, daily())).toBe(once);
  });

  it("drops nothing Pranshul wrote", () => {
    const written = [
      "Wrote about the garden.",
      "Second thought about the garden.",
      " - #progress  planted tomatoes",
      "Note under rating.",
      "Orphan one.",
      "habit text line",
    ];
    let note = swap(
      daily(),
      "<!-- discretion:journal:start -->\n\n",
      `<!-- discretion:journal:start -->\n${written[0]}\n${written[1]}\n`,
    );
    note = swap(
      note,
      "\n<!-- roots:quick-notes:end -->\n",
      `\n${written[2]}\n<!-- roots:quick-notes:end -->\n`,
    );
    note = swap(note, "## Rating\n", `## Rating\n\n${written[3]}\n`);
    note = without(note, "## Habits");
    note = `${note}\n## Orphan\n${written[4]}\n${written[5]}\n`;
    const text = repairText(note, daily());
    for (const line of written) expect(text, line).toContain(line);
  });

  it("matches repeated headings by their order", () => {
    const fresh = `---\nroots: 1\n---\n\n## Notes\n\nfirst\n\n## Notes\n\nsecond\n`;
    const note = `---\nroots: 1\n---\n\n## Notes\n\nfirst\nmine one\n\n## Notes\n\nsecond\nmine two\n`;
    const text = repairText(note, fresh);
    expect(text.indexOf("mine one")).toBeLessThan(text.indexOf("second"));
    expect(text.indexOf("mine two")).toBeGreaterThan(text.indexOf("second"));
  });

  it("does not take a heading inside a code fence for a section", () => {
    const note = swap(
      daily(),
      "## Rating\n",
      "## Rating\n\n```\n## not a heading\nstill mine\n```\n",
    );
    const text = repairText(note, daily());
    expect(text).toContain("```\n## not a heading\nstill mine\n```");
    expect(text).not.toContain("## Recovered");
  });
});

describe("identifyNote", () => {
  it.each([
    ["1-Roots/Daily/2026/11/2026-11-05.md", "daily", "2026-11-05"],
    ["Daily/2026/11/2026-11-05.md", "daily", "2026-11-05"],
    ["/vault/1-Roots/Weekly/2026/2026-W45.md", "weekly", "2026-11-02"],
    ["1-Roots/Monthly/2026/2026-11.md", "monthly", "2026-11-01"],
    ["1-Roots/Quarterly/2026/2026-Q4.md", "quarterly", "2026-10-01"],
    ["1-Roots/Yearly/2026.md", "yearly", "2026-01-01"],
    ["1-Roots/Roots.md", "home", "2000-01-01"],
  ] as const)("reads %s from its name", (path, kind, date) => {
    const found = identifyNote(path, "");
    expect(found?.kind).toBe(kind);
    if (kind !== "home") expect(found?.date).toBe(date);
  });

  it("falls back to the frontmatter when the name says nothing", () => {
    expect(identifyNote("1-Roots/copy.md", "---\nroots: 1\ndate: 2026-11-05\n---\n")).toEqual({
      kind: "daily",
      date: "2026-11-05",
    });
    expect(
      identifyNote(
        "1-Roots/copy.md",
        "---\nroots: 1\nkind: weekly\nfrom: 2026-11-02\nto: 2026-11-08\n---\n",
      ),
    ).toEqual({ kind: "weekly", date: "2026-11-02" });
  });

  it("returns null for a note that is not a Roots note", () => {
    expect(identifyNote("Elsewhere/idea.md", "# idea\n")).toBeNull();
  });
});
