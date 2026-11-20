import type { NoteKind } from "./kinds.js";
import { periodOf } from "./dates.js";

/** One top-level key of a frontmatter block with the lines that belong to it. */
export interface FrontmatterBlock {
  key: string;
  lines: string[];
}

export interface ParsedFrontmatter {
  /** Whether the text starts with a frontmatter fence. */
  present: boolean;
  blocks: FrontmatterBlock[];
  /** Everything after the closing fence. */
  body: string;
  /** The text between the fences; for an unclosed fence, everything after the opening one. */
  raw: string;
  /** Why the block cannot be read, or null. */
  error: string | null;
}

const wheelAreas = [
  "health",
  "career",
  "relationships",
  "finance",
  "growth",
  "recreation",
  "social",
  "spirituality",
];

const dailyKeys = [
  "roots",
  "date",
  "rating",
  "alias",
  "aiRating",
  "aiAlias",
  "discretion",
  "habits",
  "habitTimes",
  "habitMinutes",
  "habitSource",
  "skipReasons",
];

/** The frontmatter block, fences included, of a freshly rendered note. */
export function frontmatterFor(kind: NoteKind, date: string): string {
  const lines: string[] = ["---", "roots: 1"];
  if (kind === "daily") {
    lines.push(
      `date: ${date}`,
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
    );
  } else {
    lines.push(`kind: ${kind}`);
    if (kind !== "home") {
      const { from, to } = periodOf(kind, date);
      lines.push(`from: ${from}`, `to: ${to}`);
    }
    if (kind === "weekly") lines.push("wheel:", ...wheelAreas.map((area) => `  ${area}:`));
  }
  lines.push("---");
  return lines.join("\n");
}

/** The keys a note kind's frontmatter must have. */
export function requiredKeys(kind: NoteKind): string[] {
  switch (kind) {
    case "daily":
      return [...dailyKeys];
    case "weekly":
      return ["roots", "kind", "from", "to", "wheel"];
    case "home":
      return ["roots", "kind"];
    default:
      return ["roots", "kind", "from", "to"];
  }
}

const keyLine = /^(?:"([^"]*)"|'([^']*)'|([A-Za-z0-9_][A-Za-z0-9_.-]*)):(?:\s.*)?$/;

/** Reads a frontmatter block without a YAML library; reports what it cannot read. */
export function parseFrontmatter(text: string): ParsedFrontmatter {
  if (!text.startsWith("---\n")) {
    return { present: false, blocks: [], body: text, raw: "", error: null };
  }
  const lines = text.split("\n");
  const close = lines.findIndex((line, at) => at > 0 && line === "---");
  const raw = lines.slice(1, close < 0 ? undefined : close).join("\n");
  const fail = (error: string, body: string): ParsedFrontmatter => ({
    present: true,
    blocks: [],
    body,
    raw,
    error,
  });
  if (close < 0) return fail("the frontmatter is not closed: there is no closing --- line", "");
  const body = lines.slice(close + 1).join("\n");
  const blocks: FrontmatterBlock[] = [];
  for (let at = 1; at < close; at++) {
    const line = lines[at] as string;
    const number = at + 1;
    if (/^[ ]*\t/.test(line)) return fail(`line ${number} indents with a tab`, body);
    const key = keyLine.exec(line);
    const last = blocks[blocks.length - 1];
    if (key !== null) {
      blocks.push({ key: key[1] ?? key[2] ?? key[3] ?? "", lines: [line] });
    } else if (line.trim() === "" || line.startsWith("#")) {
      if (last === undefined) blocks.push({ key: "", lines: [line] });
      else last.lines.push(line);
    } else if (line.startsWith(" ") || line === "-" || line.startsWith("- ")) {
      if (last === undefined) return fail(`line ${number} belongs to no key`, body);
      last.lines.push(line);
    } else {
      return fail(`line ${number} is not "key: value": ${line}`, body);
    }
  }
  return { present: true, blocks, body, raw, error: null };
}

const isEmptyValue = (block: FrontmatterBlock): boolean => {
  const value = (block.lines[0] as string).replace(/^[^:]*:/, "").trim();
  const rest = block.lines.slice(1).filter((line) => line.trim() !== "");
  return ["", "{}", "[]", "null", "~"].includes(value) && rest.length === 0;
};

/** The nested keys of a block that is a map of maps' children, or null when it is not one. */
function children(block: FrontmatterBlock): FrontmatterBlock[] | null {
  const head = (block.lines[0] as string).replace(/^[^:]*:/, "").trim();
  const rest = block.lines.slice(1).filter((line) => line.trim() !== "");
  if (head !== "" || rest.length === 0) return null;
  const indent = /^ */.exec(rest[0] as string)?.[0].length ?? 0;
  const out: FrontmatterBlock[] = [];
  for (const line of block.lines.slice(1)) {
    const own = /^ */.exec(line)?.[0].length ?? 0;
    const key = own === indent ? keyLine.exec(line.slice(indent)) : null;
    if (key !== null) {
      out.push({ key: key[1] ?? key[2] ?? key[3] ?? "", lines: [line] });
    } else if (out.length > 0 && (line.trim() === "" || own > indent)) {
      (out[out.length - 1] as FrontmatterBlock).lines.push(line);
    } else {
      return null;
    }
  }
  return out;
}

function mergeBlock(existing: FrontmatterBlock, fresh: FrontmatterBlock): FrontmatterBlock {
  const freshKids = children(fresh);
  if (freshKids === null) return existing;
  if (isEmptyValue(existing)) return fresh;
  const existingKids = children(existing);
  if (existingKids === null) return existing;
  const used = new Set<FrontmatterBlock>();
  const merged = freshKids.map((kid) => {
    const mine = existingKids.find((k) => k.key === kid.key && !used.has(k));
    if (mine === undefined) return kid;
    used.add(mine);
    return mine;
  });
  const extra = existingKids.filter((k) => !used.has(k));
  return {
    key: existing.key,
    lines: [existing.lines[0] as string, ...[...merged, ...extra].flatMap((k) => k.lines)],
  };
}

/** `fresh`'s keys with `existing`'s values; keys only `existing` has are kept at the end. */
export function mergeFrontmatter(existing: ParsedFrontmatter, fresh: ParsedFrontmatter): string {
  const unused = new Set(existing.blocks);
  const out: FrontmatterBlock[] = existing.blocks.filter((b) => b.key === "");
  for (const block of out) unused.delete(block);
  for (const block of fresh.blocks) {
    const mine = existing.blocks.find((b) => b.key === block.key && unused.has(b));
    if (mine === undefined) {
      out.push(block);
    } else {
      unused.delete(mine);
      out.push(mergeBlock(mine, block));
    }
  }
  for (const block of existing.blocks) if (unused.has(block)) out.push(block);
  return ["---", ...out.flatMap((b) => b.lines), "---"].join("\n");
}
