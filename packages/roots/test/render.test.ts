import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { shippedQuestions, shippedSnippets, shippedTemplate } from "../src/assets.js";
import { noteLinks, noteTitle, questionFor } from "../src/dates.js";
import { render, renderNote, renderReport, templatePath } from "../src/render.js";
import { fixtureDates, kinds, shipped } from "./roots-helpers.js";

describe("render", () => {
  it("starts a daily note with its frontmatter, title, links and alias input", () => {
    const text = render("daily", "2026-11-05", shipped("daily"));
    expect(
      text.startsWith(
        [
          "---",
          "roots: 1",
          "date: 2026-11-05",
          "rating:",
          "alias:",
          "aiRating:",
          "aiAlias:",
          "discretion: 1",
          "habits: {}",
          "habitTimes: {}",
          "habitMinutes: {}",
          "habitSource: {}",
          "skipReasons: {}",
          "---",
          "",
          "# Thursday 5 November 2026",
          "",
          noteLinks("daily", "2026-11-05"),
          "",
          "INPUT[text(placeholder(Name this day in a few words)):alias]",
          "",
          "## Journal",
          "",
        ].join("\n"),
      ),
    ).toBe(true);
  });

  it("puts the day's prompt and ribbon embed in a daily note", () => {
    const text = render("daily", "2026-11-05", shipped("daily"));
    expect(text).toContain(`> ${questionFor(shippedQuestions(), "2026-11-05")}\n`);
    expect(text).toContain(
      "![[3-Mycelium/ribbons/2026-11-05.svg]]\n<!-- discretion:ribbon:end -->",
    );
  });

  it("gives a weekly note its period, the eight empty wheel keys and its title", () => {
    const text = render("weekly", "2026-11-05", shipped("weekly"));
    expect(
      text.startsWith(
        [
          "---",
          "roots: 1",
          "kind: weekly",
          "from: 2026-11-02",
          "to: 2026-11-08",
          "wheel:",
          "  health:",
          "  career:",
          "  relationships:",
          "  finance:",
          "  growth:",
          "  recreation:",
          "  social:",
          "  spirituality:",
          "---",
          "",
          "# Week 45, 2026",
          "",
          noteLinks("weekly", "2026-11-05"),
          "",
          "## Ratings",
          "",
        ].join("\n"),
      ),
    ).toBe(true);
  });

  it.each([
    ["monthly", "monthly", "2026-11-01", "2026-11-30"],
    ["quarterly", "quarterly", "2026-10-01", "2026-12-31"],
    ["yearly", "yearly", "2026-01-01", "2026-12-31"],
  ] as const)("gives a %s note kind, from and to and no wheel key", (kind, name, from, to) => {
    const text = render(kind, "2026-11-05", shipped(kind));
    expect(
      text.startsWith(`---\nroots: 1\nkind: ${name}\nfrom: ${from}\nto: ${to}\n---\n\n# `),
    ).toBe(true);
    expect(text.split("\n---\n")[0]).not.toContain("wheel");
    expect(text).toContain(`# ${noteTitle(kind, "2026-11-05")}\n`);
  });

  it("gives home the frontmatter and title install used", () => {
    expect(
      render("home", "2026-11-05", shipped("home")).startsWith(
        "---\nroots: 1\nkind: home\n---\n\n# Roots\n\n## Today\n",
      ),
    ).toBe(true);
  });

  it.each(kinds)(
    "renders %s deterministically for the seven fixture dates, with nothing left over",
    (kind) => {
      for (const date of fixtureDates) {
        const first = render(kind, date, shipped(kind));
        expect(render(kind, date, shipped(kind))).toBe(first);
        expect(first, `${kind} ${date}`).not.toMatch(/\{\{[^}]*\}\}/);
        expect(first).not.toContain("\r");
        expect(first.endsWith("\n")).toBe(true);
        expect(first.endsWith("\n\n")).toBe(false);
      }
    },
  );

  it("gives every day of a week the same weekly, monthly, quarterly and yearly note", () => {
    for (const kind of ["weekly", "monthly", "quarterly", "yearly"] as const) {
      const [first, ...rest] = fixtureDates.map((d) => render(kind, d, shipped(kind)));
      for (const other of rest) expect(other).toBe(first);
    }
  });

  it("expands the queries a template names", () => {
    const text = render("weekly", "2026-11-05", shipped("weekly"));
    expect(text.match(/```dataviewjs/g)).toHaveLength(4);
  });

  it("applies an edited template: placeholders filled, everything else copied", () => {
    const ctx = {
      template: "{{frontmatter}}\n\nMine: {{title}} ({{date}})\n\n{{links}}\n\nVIEW[{x}] <% y %>\n",
      questions: shippedQuestions(),
      snippets: shippedSnippets(),
    };
    expect(render("weekly", "2026-11-05", ctx)).toContain(
      "\n\nMine: Week 45, 2026 (2026-11-02)\n\n",
    );
    expect(render("weekly", "2026-11-05", ctx).endsWith("\n\nVIEW[{x}] <% y %>\n")).toBe(true);
    expect(render("daily", "2026-11-05", ctx)).toContain(
      "Mine: Thursday 5 November 2026 (2026-11-05)",
    );
  });

  it("fills {{question}} for every kind", () => {
    const ctx = { template: "{{question}}", questions: shippedQuestions(), snippets: {} };
    expect(render("weekly", "2026-11-05", ctx)).toBe(
      `${questionFor(shippedQuestions(), "2026-11-05")}\n`,
    );
  });

  it("leaves an unknown placeholder visible and reports it", () => {
    const ctx = {
      template: "{{frontmatter}}\n{{mood}} {{query:nope}} {{mood}}",
      questions: shippedQuestions(),
      snippets: shippedSnippets(),
    };
    const { text, unknown } = renderReport("daily", "2026-11-05", ctx);
    expect(text).toContain("\n{{mood}} {{query:nope}} {{mood}}\n");
    expect(unknown).toEqual(["mood", "query:nope"]);
    expect(render("daily", "2026-11-05", ctx)).toBe(text);
  });

  it("writes \\n line endings even from a template saved with \\r\\n", () => {
    const ctx = {
      template: "{{frontmatter}}\r\n\r\n# {{title}}\r\n",
      questions: shippedQuestions(),
      snippets: shippedSnippets(),
    };
    const text = render("daily", "2026-11-05", ctx);
    expect(text).not.toContain("\r");
    expect(text.endsWith("# Thursday 5 November 2026\n")).toBe(true);
  });

  it("adds the final newline a template lacks, and keeps just one", () => {
    const base = { questions: shippedQuestions(), snippets: shippedSnippets() };
    expect(render("home", "2026-11-05", { ...base, template: "# {{title}}" })).toBe("# Roots\n");
    expect(render("home", "2026-11-05", { ...base, template: "# {{title}}\n" })).toBe("# Roots\n");
  });

  it("refuses a date that does not exist", () => {
    expect(() => render("daily", "2026-02-30", shipped("daily"))).toThrow();
  });
});

describe("renderNote", () => {
  const made: string[] = [];
  afterEach(() => {
    for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  it("names where each template lives", () => {
    expect(templatePath("daily")).toBe("1-Roots/_roots/templates/daily.md");
    expect(templatePath("home")).toBe("1-Roots/_roots/templates/home.md");
  });

  it("reads the template and questions through the reader and renders", async () => {
    const files: Record<string, string> = {
      "1-Roots/_roots/templates/daily.md": shippedTemplate("daily"),
      "1-Roots/_roots/questions.md": shippedQuestions(),
    };
    const read = (path: string): Promise<string | null> => Promise.resolve(files[path] ?? null);
    expect(await renderNote("daily", "2026-11-05", read, shippedSnippets())).toBe(
      render("daily", "2026-11-05", shipped("daily")),
    );
  });

  it("uses an edited template from the vault", async () => {
    const files: Record<string, string> = {
      "1-Roots/_roots/templates/daily.md": "mine {{date}}\n",
      "1-Roots/_roots/questions.md": shippedQuestions(),
    };
    const read = (path: string): Promise<string | null> => Promise.resolve(files[path] ?? null);
    expect(await renderNote("daily", "2026-11-05", read, {})).toBe("mine 2026-11-05\n");
  });

  it("refuses with D2011 and a remedy when the template or questions are missing", async () => {
    const none = (): Promise<string | null> => Promise.resolve(null);
    await expect(renderNote("daily", "2026-11-05", none, {})).rejects.toMatchObject({
      code: "D2011",
      remedy: expect.stringContaining("discretion roots install") as unknown,
    });
    const onlyTemplate = (path: string): Promise<string | null> =>
      Promise.resolve(path.endsWith("daily.md") ? "x\n" : null);
    await expect(renderNote("daily", "2026-11-05", onlyTemplate, {})).rejects.toMatchObject({
      code: "D2011",
    });
  });

  it("is used unchanged on a file system", async () => {
    const dir = mkdtempSync(join(tmpdir(), "roots-render-"));
    made.push(dir);
    const put = (path: string, text: string): void => {
      mkdirSync(dirname(join(dir, path)), { recursive: true });
      writeFileSync(join(dir, path), text);
    };
    put("1-Roots/_roots/templates/yearly.md", shippedTemplate("yearly"));
    put("1-Roots/_roots/questions.md", shippedQuestions());
    const { readFile } = await import("node:fs/promises");
    const read = (path: string): Promise<string | null> =>
      readFile(join(dir, path), "utf8").catch(() => null);
    expect(await renderNote("yearly", "2026-03-01", read, shippedSnippets())).toBe(
      render("yearly", "2026-03-01", shipped("yearly")),
    );
  });
});
