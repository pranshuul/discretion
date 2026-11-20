import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { shippedQuestions, shippedSnippets, shippedTemplate } from "../src/assets.js";
import { checkTemplateText, checkTemplates, type Problem } from "../src/check.js";
import { kinds } from "./roots-helpers.js";

const ctx = { questions: shippedQuestions(), snippets: shippedSnippets() };
const today = "2026-11-20";
const check = (kind: (typeof kinds)[number], text: string): Problem[] =>
  checkTemplateText(kind, text, ctx, today);
const daily = shippedTemplate("daily");
const weekly = shippedTemplate("weekly");
const codes = (problems: Problem[]): string[] => problems.map((p) => `${p.severity}:${p.code}`);

function swap(text: string, from: string, to: string): string {
  expect(text.split(from).length, `"${from}" occurs once`).toBe(2);
  return text.replace(from, () => to);
}

describe("checkTemplateText", () => {
  it.each(kinds)("finds nothing wrong with the shipped %s template", (kind) => {
    expect(check(kind, shippedTemplate(kind))).toEqual([]);
  });

  it("reports an unknown placeholder as an error, with its line and the fix", () => {
    const problems = check("daily", swap(daily, "## Journal\n", "## Journal\n\n{{mood}}\n"));
    expect(codes(problems)).toEqual(["error:unknown-placeholder"]);
    expect(problems[0]).toMatchObject({ file: "daily.md", line: 11 });
    expect(problems[0]?.message).toContain("{{mood}}");
    expect(problems[0]?.fix).toMatch(/placeholder/);
  });

  it("reports an unknown query name", () => {
    expect(codes(check("weekly", swap(weekly, "{{query:logs}}", "{{query:nope}}")))).toEqual([
      "error:unknown-placeholder",
    ]);
  });

  it("reports each unknown placeholder once per line it appears on", () => {
    const problems = check("daily", `${daily}\n{{a}} {{b}}\n{{a}}\n`);
    expect(problems.filter((p) => p.code === "unknown-placeholder")).toHaveLength(3);
  });

  it("reports a marker pair whose start was removed as unbalanced", () => {
    const problems = check("daily", swap(daily, "<!-- discretion:journal:start -->\n", ""));
    expect(codes(problems)).toEqual(["error:marker-unbalanced"]);
    expect(problems[0]?.message).toContain("discretion:journal");
  });

  it("reports an end marker before its start as unbalanced", () => {
    const text = swap(
      swap(daily, "<!-- discretion:qa:start -->", "<!-- discretion:qa:TMP -->"),
      "<!-- discretion:qa:end -->",
      "<!-- discretion:qa:start -->",
    ).replace("<!-- discretion:qa:TMP -->", "<!-- discretion:qa:end -->");
    expect(codes(check("daily", text))).toEqual(["error:marker-unbalanced"]);
  });

  it("reports a duplicated pair", () => {
    const text = `${daily}\n<!-- discretion:habits:start -->\n<!-- discretion:habits:end -->\n`;
    expect(codes(check("daily", text))).toEqual(["error:marker-duplicated"]);
  });

  it("reports a malformed marker", () => {
    const text = swap(daily, "<!-- discretion:ribbon:start -->", "<!--discretion:ribbon:start-->");
    expect(codes(check("daily", text))).toContain("error:marker-malformed");
  });

  it.each(["journal", "pictures", "qa", "private"])(
    "makes removing the private %s pair an error: its text would stop being private",
    (name) => {
      const re = new RegExp(
        `<!-- discretion:${name}:start -->[\\s\\S]*?<!-- discretion:${name}:end -->\\n`,
      );
      const problems = check("daily", daily.replace(re, ""));
      expect(codes(problems)).toEqual(["error:marker-missing"]);
      expect(problems[0]?.message).toMatch(/private|frontier/i);
    },
  );

  it.each(["summary", "reflection"])("makes removing the weekly %s pair an error", (name) => {
    const re = new RegExp(
      `<!-- discretion:${name}:start -->[\\s\\S]*?<!-- discretion:${name}:end -->\\n`,
    );
    expect(codes(check("weekly", weekly.replace(re, "")))).toEqual(["error:marker-missing"]);
  });

  it.each(["habits", "plan", "captured", "ribbon"])(
    "makes removing the optional %s pair a warning: its writer then skips the note",
    (name) => {
      const re = new RegExp(
        `<!-- discretion:${name}:start -->[\\s\\S]*?<!-- discretion:${name}:end -->\\n`,
      );
      const problems = check("daily", daily.replace(re, ""));
      expect(codes(problems)).toEqual(["warning:marker-missing"]);
      expect(problems[0]?.message).toMatch(/skip/i);
    },
  );

  it("makes removing the quick-notes end marker a warning", () => {
    const problems = check("daily", swap(daily, "<!-- roots:quick-notes:end -->\n", ""));
    expect(codes(problems)).toEqual(["warning:marker-missing"]);
    expect(problems[0]?.message).toContain("roots:quick-notes:end");
  });

  it("reports a template with no frontmatter", () => {
    const problems = check("daily", swap(daily, "{{frontmatter}}\n\n", ""));
    expect(codes(problems)).toEqual(["error:frontmatter-invalid"]);
    expect(problems[0]?.message).toMatch(/no frontmatter/);
  });

  it("reports literal frontmatter that lacks a key, or that cannot be read", () => {
    const lacking = "---\nroots: 1\nkind: weekly\nfrom: x\nto: y\n---\n";
    const problems = check("weekly", swap(weekly, "{{frontmatter}}\n", lacking));
    expect(codes(problems)).toEqual(["error:frontmatter-invalid"]);
    expect(problems[0]?.message).toContain("wheel");
    const broken = check(
      "weekly",
      swap(weekly, "{{frontmatter}}\n", "---\nroots: 1\n\tkind: weekly\n---\n"),
    );
    expect(codes(broken)).toEqual(["error:frontmatter-invalid"]);
  });

  it("reports a frontmatter whose kind or schema marker is wrong", () => {
    const text = swap(
      weekly,
      "{{frontmatter}}\n",
      "---\nroots: 2\nkind: daily\nfrom: a\nto: b\nwheel:\n---\n",
    );
    const problems = check("weekly", text);
    expect(problems.filter((p) => p.code === "frontmatter-invalid")).toHaveLength(2);
  });

  it("gives every problem a message and a fix", () => {
    const text = `${swap(daily, "<!-- discretion:journal:start -->\n", "")}\n{{x}}\n`;
    for (const p of check("daily", text)) {
      expect(p.message.length).toBeGreaterThan(10);
      expect(p.fix.length).toBeGreaterThan(10);
    }
  });
});

describe("checkTemplates", () => {
  const made: string[] = [];
  afterEach(() => {
    for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  function vault(): string {
    const dir = mkdtempSync(join(tmpdir(), "roots-check-"));
    made.push(dir);
    return dir;
  }
  const put = (v: string, path: string, text: string): void => {
    mkdirSync(dirname(join(v, path)), { recursive: true });
    writeFileSync(join(v, path), text);
  };
  function installed(): string {
    const v = vault();
    for (const k of kinds) put(v, `1-Roots/_roots/templates/${k}.md`, shippedTemplate(k));
    for (const l of [...kinds, "today", "repair"]) {
      put(v, `1-Roots/_roots/launchers/${l}.md`, "<% await tp.user.roots(tp) %>\n");
    }
    put(v, "1-Roots/_roots/questions.md", shippedQuestions());
    return v;
  }

  it("finds nothing wrong in an installed vault", () => {
    expect(checkTemplates({ vault: installed(), today })).toEqual([]);
  });

  it("checks every kind, or the one asked for", () => {
    const v = installed();
    put(v, "1-Roots/_roots/templates/daily.md", `${daily}\n{{x}}\n`);
    put(v, "1-Roots/_roots/templates/weekly.md", `${weekly}\n{{y}}\n`);
    expect(checkTemplates({ vault: v, today }).map((p) => p.file)).toEqual([
      "daily.md",
      "weekly.md",
    ]);
    expect(checkTemplates({ vault: v, kind: "weekly", today }).map((p) => p.file)).toEqual([
      "weekly.md",
    ]);
  });

  it("reports a missing template and a missing question list", () => {
    const v = installed();
    rmSync(join(v, "1-Roots/_roots/templates/yearly.md"));
    expect(codes(checkTemplates({ vault: v, today }))).toEqual(["error:template-missing"]);
    rmSync(join(v, "1-Roots/_roots/questions.md"));
    expect(codes(checkTemplates({ vault: v, today }))).toContain("error:questions-missing");
  });

  it("reports an edited or missing launcher: launchers are never edited", () => {
    const v = installed();
    put(v, "1-Roots/_roots/launchers/daily.md", "my own\n");
    rmSync(join(v, "1-Roots/_roots/launchers/repair.md"));
    const problems = checkTemplates({ vault: v, today });
    expect(codes(problems)).toEqual(["error:launcher-edited", "error:launcher-missing"]);
    expect(problems[0]?.fix).toContain("discretion roots install");
  });

  it("leaves launchers out when a single kind is checked", () => {
    const v = installed();
    put(v, "1-Roots/_roots/launchers/daily.md", "my own\n");
    expect(checkTemplates({ vault: v, kind: "weekly", today })).toEqual([]);
  });
});
