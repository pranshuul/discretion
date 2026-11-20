import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { shippedTemplate, type TemplateName } from "./assets.js";

export const templatesDir = "1-Roots/_roots/templates";

function current(vault: string, name: TemplateName): string | null {
  try {
    return readFileSync(join(vault, templatesDir, `${name}.md`), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

type Edit = { op: " " | "-" | "+"; line: string };

/** The line-by-line edit script from `a` to `b`, from their longest common subsequence. */
function edits(a: string[], b: string[]): Edit[] {
  const table = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      const row = table[i] as number[];
      row[j] =
        a[i] === b[j]
          ? ((table[i + 1] as number[])[j + 1] as number) + 1
          : Math.max((table[i + 1] as number[])[j] as number, row[j + 1] as number);
    }
  }
  const out: Edit[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      out.push({ op: " ", line: a[i] as string });
      i++;
      j++;
    } else if (
      j >= b.length ||
      (i < a.length &&
        ((table[i + 1] as number[])[j] as number) >= ((table[i] as number[])[j + 1] as number))
    ) {
      out.push({ op: "-", line: a[i] as string });
      i++;
    } else {
      out.push({ op: "+", line: b[j] as string });
      j++;
    }
  }
  return out;
}

const context = 3;

/** A unified diff of `edits`, three lines of context around each change. */
function unified(all: Edit[]): string {
  const keep = all.map((_, at) =>
    all.slice(Math.max(0, at - context), at + context + 1).some((e) => e.op !== " "),
  );
  const lines: string[] = [];
  let oldAt = 1;
  let newAt = 1;
  let at = 0;
  while (at < all.length) {
    if (!keep[at]) {
      const e = all[at] as Edit;
      if (e.op !== "+") oldAt++;
      if (e.op !== "-") newAt++;
      at++;
      continue;
    }
    const hunkOld = oldAt;
    const hunkNew = newAt;
    let oldCount = 0;
    let newCount = 0;
    const body: string[] = [];
    while (at < all.length && keep[at]) {
      const e = all[at] as Edit;
      body.push(`${e.op}${e.line}`);
      if (e.op !== "+") oldCount++;
      if (e.op !== "-") newCount++;
      at++;
    }
    oldAt += oldCount;
    newAt += newCount;
    lines.push(`@@ -${hunkOld},${oldCount} +${hunkNew},${newCount} @@`, ...body);
  }
  return lines.join("\n");
}

const split = (text: string): string[] => {
  const lines = text.split("\n");
  if (lines[lines.length - 1] === "") lines.pop();
  return lines;
};

/** The difference between a template in the vault and its shipped default; empty when equal. */
export async function templateDiff(vault: string, name: TemplateName): Promise<string> {
  const shipped = shippedTemplate(name);
  const text = current(vault, name);
  if (text === shipped) return "";
  const body = unified(edits(split(shipped), split(text ?? "")));
  return `--- shipped ${name}.md\n+++ ${templatesDir}/${name}.md\n${body}\n`;
}

/** Restores a template to its shipped default; returns whether it changed. */
export async function templateReset(
  vault: string,
  name: TemplateName,
  dryRun = false,
): Promise<boolean> {
  const shipped = shippedTemplate(name);
  if (current(vault, name) === shipped) return false;
  if (!dryRun) {
    mkdirSync(join(vault, templatesDir), { recursive: true });
    writeFileSync(join(vault, templatesDir, `${name}.md`), shipped);
  }
  return true;
}
