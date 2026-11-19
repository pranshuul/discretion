/** Reads packages/roots/DESIGN.md and extracts its machine-checkable parts. */
import { readFileSync } from "node:fs";

export function loadDesign(): string {
  return readFileSync(new URL("../DESIGN.md", import.meta.url), "utf8");
}

/** The journal prompts of the "Question list" section, in day-of-year order. */
export function parseQuestions(design: string): string[] {
  const start = design.indexOf("\n## Question list\n");
  if (start < 0) throw new Error("DESIGN.md has no Question list section");
  const prompts: string[] = [];
  for (const line of design.slice(start).split("\n")) {
    const m = /^(\d+)\. (.+)$/.exec(line);
    if (!m) continue;
    if (Number(m[1]) !== prompts.length + 1) throw new Error(`question ${m[1]} out of order`);
    prompts.push(m[2] ?? "");
  }
  return prompts;
}

/** Fenced code blocks of `text` with the heading path they sit under. */
interface Block {
  info: string;
  body: string[];
  h2: string;
  h3: string;
}

function blocks(text: string): Block[] {
  const out: Block[] = [];
  let h2 = "";
  let h3 = "";
  let open: Block | null = null;
  let fence = "";
  for (const line of text.split("\n")) {
    const m = /^(`{3,})(.*)$/.exec(line);
    if (open) {
      if (m && line.trim() === fence) {
        out.push(open);
        if (fence.length > 3) {
          const { h2: outer2, h3: outer3 } = open;
          out.push(...blocks(open.body.join("\n")).map((x) => ({ ...x, h2: outer2, h3: outer3 })));
        }
        open = null;
      } else open.body.push(line);
      continue;
    }
    if (m) {
      fence = m[1] ?? "```";
      open = { info: (m[2] ?? "").trim(), body: [], h2, h3 };
    } else if (line.startsWith("## ")) {
      h2 = line.slice(3);
      h3 = "";
    } else if (line.startsWith("### ")) h3 = line.slice(4);
  }
  return out;
}

/** The code of the first `js` block under "### <heading>" in the "Recap queries" section. */
export function querySnippet(design: string, heading: string): string {
  const b = blocks(design).find(
    (x) => x.h2 === "Recap queries" && x.h3 === heading && x.info === "js",
  );
  if (!b) throw new Error(`DESIGN.md has no js snippet under Recap queries / ${heading}`);
  return b.body.join("\n");
}

/** The inlineJS code of the Meta Bind button whose label is `label`, dedented. */
export function buttonCode(design: string, label: string): string {
  for (const b of blocks(design)) {
    if (b.info !== "meta-bind-button" || !b.body.includes(`label: ${label}`)) continue;
    const at = b.body.findIndex((l) => /^\s*code: \|$/.test(l));
    if (at < 0) break;
    const indent = (l: string): number => l.length - l.trimStart().length;
    const own = indent(b.body[at] ?? "");
    const code: string[] = [];
    for (const l of b.body.slice(at + 1)) {
      if (l.trim() && indent(l) <= own) break;
      code.push(l);
    }
    const cut = Math.min(...code.filter((l) => l.trim()).map(indent));
    return code.map((l) => l.slice(cut)).join("\n");
  }
  throw new Error(`DESIGN.md has no button labelled ${label}`);
}
