import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { systemClock, today as clockToday } from "@discretion/core";
import { launcherNames, launcherText, shippedQuestions, shippedSnippets } from "./assets.js";
import { fixedPlaceholders } from "./fill.js";
import { parseFrontmatter, requiredKeys } from "./frontmatter.js";
import { noteKinds, queryNames, type NoteKind } from "./kinds.js";
import { questionsPath, renderReport, templatePath, type RenderContext } from "./render.js";

export interface Problem {
  severity: "error" | "warning";
  /** The file the problem is in, such as `daily.md`. */
  file: string;
  line: number | null;
  code: string;
  message: string;
  fix: string;
}

/** The marker pairs each note kind's default template has, and whether they hold private text. */
const pairsOf = (kind: NoteKind): string[] => {
  if (kind === "daily") {
    return ["journal", "habits", "plan", "captured", "pictures", "qa", "private", "ribbon"];
  }
  return kind === "home" ? [] : ["summary", "reflection"];
};
const privatePairs = ["journal", "pictures", "qa", "private", "summary", "reflection"];
const quickMarker = "<!-- roots:quick-notes:end -->";

const placeholderHelp = `Use one of the placeholders ${fixedPlaceholders.map((p) => `{{${p}}}`).join(", ")}, or {{query:<name>}} with a name from ${queryNames.join(", ")}.`;

/** Validates one template's text; nothing is read or written. */
export function checkTemplateText(
  kind: NoteKind,
  text: string,
  ctx: Omit<RenderContext, "template">,
  today: string,
): Problem[] {
  const file = `${kind}.md`;
  const problems: Problem[] = [];
  const add = (
    severity: Problem["severity"],
    line: number | null,
    code: string,
    message: string,
    fix: string,
  ): void => {
    problems.push({ severity, file, line, code, message, fix });
  };
  const lines = text.replace(/\r\n?/g, "\n").split("\n");

  // Placeholders.
  lines.forEach((line, at) => {
    for (const m of line.matchAll(/\{\{([^{}\n]+)\}\}/g)) {
      const name = m[1] as string;
      const known = name.startsWith("query:")
        ? (queryNames as readonly string[]).includes(name.slice("query:".length))
        : (fixedPlaceholders as readonly string[]).includes(name);
      if (!known) {
        add(
          "error",
          at + 1,
          "unknown-placeholder",
          `{{${name}}} is not a placeholder Roots fills, so it would show in every note as written.`,
          `${placeholderHelp} Or delete it.`,
        );
      }
    }
  });

  // Markers, outside code fences.
  const seen = new Map<string, { type: "start" | "end"; line: number }[]>();
  const malformed = new Set<string>();
  let fence = "";
  lines.forEach((line, at) => {
    const open = /^ {0,3}(`{3,}|~{3,})/.exec(line);
    if (fence === "" && open !== null) fence = open[1] as string;
    else if (fence !== "" && line.trim() === fence) fence = "";
    else if (fence === "" && /<!--.*discretion:[a-z-]+:(start|end)/.test(line)) {
      const m = /^<!-- discretion:([a-z-]+):(start|end) -->$/.exec(line);
      if (m === null) {
        add(
          "error",
          at + 1,
          "marker-malformed",
          `The marker on this line is not written exactly, so no writer will find it.`,
          "Write it on a line of its own as <!-- discretion:NAME:start --> or <!-- discretion:NAME:end -->, with the single spaces shown.",
        );
        const loose = /discretion:([a-z-]+):(start|end)/.exec(line);
        if (loose !== null) {
          const list = seen.get(loose[1] as string) ?? [];
          list.push({ type: loose[2] as "start" | "end", line: at + 1 });
          seen.set(loose[1] as string, list);
          malformed.add(loose[1] as string);
        }
      } else {
        const list = seen.get(m[1] as string) ?? [];
        list.push({ type: m[2] as "start" | "end", line: at + 1 });
        seen.set(m[1] as string, list);
      }
    }
  });
  for (const [name, list] of seen) {
    if (malformed.has(name)) continue;
    let open = false;
    let pairs = 0;
    let broken: number | null = null;
    for (const m of list) {
      if (m.type === "start" && !open) open = true;
      else if (m.type === "end" && open) {
        open = false;
        pairs++;
      } else broken ??= m.line;
    }
    if (open) broken ??= (list[list.length - 1] as { line: number }).line;
    if (broken !== null) {
      add(
        "error",
        broken,
        "marker-unbalanced",
        `The discretion:${name} markers are not a start followed by an end, so its writer cannot find the pair.`,
        `Keep exactly one <!-- discretion:${name}:start --> line followed by one <!-- discretion:${name}:end --> line.`,
      );
    } else if (pairs > 1) {
      add(
        "error",
        (list[2] as { line: number }).line,
        "marker-duplicated",
        `The discretion:${name} pair appears ${pairs} times, so its writer would not know which to use.`,
        `Keep one discretion:${name} pair and delete the others.`,
      );
    }
  }
  for (const name of pairsOf(kind)) {
    if (seen.has(name)) continue;
    if (privatePairs.includes(name)) {
      add(
        "error",
        null,
        "marker-missing",
        `The discretion:${name} pair is missing. Its text is private, and without the markers it would be sent to frontier models as ordinary text.`,
        `Put back <!-- discretion:${name}:start --> and <!-- discretion:${name}:end --> where the section's text goes, or run discretion roots template reset ${kind}.`,
      );
    } else {
      add(
        "warning",
        null,
        "marker-missing",
        `The discretion:${name} pair is missing, so its writer will skip ${kind} notes and discretion doctor will list them.`,
        `Put back <!-- discretion:${name}:start --> and <!-- discretion:${name}:end --> if you want that section filled, or leave it out on purpose.`,
      );
    }
  }
  if (kind === "daily" && !lines.includes(quickMarker)) {
    add(
      "warning",
      null,
      "marker-missing",
      `The ${quickMarker} line is missing, so the quick-note buttons and the capture pipeline will skip daily notes.`,
      `Put ${quickMarker} on a line of its own at the end of the Quick notes section.`,
    );
  }

  // The frontmatter of a trial render.
  let rendered: string | null = null;
  try {
    rendered = renderReport(kind, today, { ...ctx, template: text }).text;
  } catch (error) {
    add(
      "error",
      null,
      "render-failed",
      `A trial render for ${today} failed: ${(error as Error).message}`,
      "Fix what the message names, then run the check again.",
    );
  }
  if (rendered !== null) {
    const fm = parseFrontmatter(rendered);
    const bad = (message: string, fix: string): void =>
      add("error", null, "frontmatter-invalid", message, fix);
    if (!fm.present) {
      bad(
        "The rendered note has no frontmatter, but every recap and writer reads it.",
        "Put {{frontmatter}} on the first line of the template.",
      );
    } else if (fm.error !== null) {
      bad(
        `The rendered note's frontmatter cannot be read: ${fm.error}.`,
        "Use {{frontmatter}}, or fix the lines it names: keys at the left edge, two-space indents, no tabs.",
      );
    } else {
      const value = (key: string): string | undefined =>
        fm.blocks
          .find((b) => b.key === key)
          ?.lines[0]?.replace(/^[^:]*:/, "")
          .trim();
      for (const key of requiredKeys(kind)) {
        if (!fm.blocks.some((b) => b.key === key)) {
          bad(
            `The frontmatter has no ${key} key, which ${kind} notes must have.`,
            "Use {{frontmatter}}, which writes every key; or add the key back.",
          );
        }
      }
      if (fm.blocks.some((b) => b.key === "roots") && value("roots") !== "1") {
        bad("The frontmatter's roots key must be 1.", "Write roots: 1, or use {{frontmatter}}.");
      }
      if (kind !== "daily" && fm.blocks.some((b) => b.key === "kind") && value("kind") !== kind) {
        bad(
          `The frontmatter's kind key must be ${kind}.`,
          `Write kind: ${kind}, or use {{frontmatter}}.`,
        );
      }
    }
  }
  return problems;
}

export interface CheckOptions {
  vault: string;
  kind?: NoteKind;
  today?: string;
}

/** Validates the templates and launchers in the vault. */
export function checkTemplates(options: CheckOptions): Problem[] {
  const today = options.today ?? clockToday(systemClock);
  const read = (path: string): string | null =>
    existsSync(join(options.vault, path)) ? readFileSync(join(options.vault, path), "utf8") : null;
  const problems: Problem[] = [];
  const questions = read(questionsPath);
  const ctx = { questions: questions ?? "", snippets: shippedSnippets() };
  if (questions === null) ctx.questions = shippedQuestions();
  for (const kind of options.kind === undefined ? noteKinds : [options.kind]) {
    const text = read(templatePath(kind));
    if (text === null) {
      problems.push({
        severity: "error",
        file: `${kind}.md`,
        line: null,
        code: "template-missing",
        message: `${templatePath(kind)} does not exist, so ${kind} notes cannot be created.`,
        fix: `Run discretion roots template reset ${kind} to write the shipped default.`,
      });
    } else {
      problems.push(...checkTemplateText(kind, text, ctx, today));
    }
  }
  if (questions === null) {
    problems.push({
      severity: "error",
      file: "questions.md",
      line: null,
      code: "questions-missing",
      message: `${questionsPath} does not exist, so no note can show its question of the day.`,
      fix: "Run discretion roots install to write the default question list.",
    });
  }
  if (options.kind === undefined) {
    for (const name of launcherNames) {
      const text = read(`1-Roots/_roots/launchers/${name}.md`);
      if (text === null || text.replace(/\r\n?/g, "\n") !== launcherText) {
        const missing = text === null;
        problems.push({
          severity: "error",
          file: `launchers/${name}.md`,
          line: null,
          code: missing ? "launcher-missing" : "launcher-edited",
          message: missing
            ? `The launcher ${name}.md does not exist, so Templater cannot run it.`
            : `The launcher ${name}.md was edited. Launchers hold only the call into the renderer and are never edited.`,
          fix: "Run discretion roots install to restore it.",
        });
      }
    }
  }
  return problems;
}
