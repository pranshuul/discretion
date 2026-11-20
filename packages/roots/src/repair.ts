import { dateFromName, periodOf } from "./dates.js";
import { mergeFrontmatter, parseFrontmatter, type ParsedFrontmatter } from "./frontmatter.js";
import type { NoteKind } from "./kinds.js";

/** Home has no date; the renderer needs one only for a template that names it. */
const homeDate = "1970-01-01";

/** The kind and date of the note at `path`, from its name or else its frontmatter. */
export function identifyNote(path: string, text: string): { kind: NoteKind; date: string } | null {
  const name = (path.split("/").pop() ?? "").replace(/\.md$/, "");
  const byName: NoteKind[] = ["daily", "weekly", "quarterly", "monthly", "yearly"];
  for (const kind of byName) {
    const date = dateFromName(kind, name);
    if (date !== null) return { kind, date };
  }
  if (name === "Roots" && (path === "Roots.md" || path.endsWith("/Roots.md"))) {
    return { kind: "home", date: homeDate };
  }
  const fm = parseFrontmatter(text.replace(/\r\n?/g, "\n"));
  const value = (key: string): string | undefined =>
    fm.blocks
      .find((b) => b.key === key)
      ?.lines[0]?.replace(/^[^:]*:/, "")
      .trim()
      .replace(/^["']|["']$/g, "");
  const valid = (date: string | undefined): date is string => {
    if (date === undefined || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
    try {
      periodOf("daily", date);
      return true;
    } catch {
      return false;
    }
  };
  const kind = value("kind");
  if (kind === "home") return { kind: "home", date: homeDate };
  if (kind !== undefined && ["weekly", "monthly", "quarterly", "yearly"].includes(kind)) {
    const from = value("from");
    return valid(from) ? { kind: kind as NoteKind, date: from } : null;
  }
  const date = value("date");
  return kind === undefined && valid(date) ? { kind: "daily", date } : null;
}

interface Line {
  text: string;
  inFence: boolean;
  /** The line that opens, or closes, a fenced code block. */
  opens: boolean;
  closes: boolean;
  /** `pair` for lines from a balanced start marker to its end marker, inclusive. */
  tag: "text" | "pair" | "orphan" | "quick" | "quick-end";
}

interface Pair {
  name: string;
  start: number;
  end: number;
}

interface Section {
  level: number;
  title: string;
  /** The index of the heading line, or null for the text before the first heading. */
  heading: number | null;
  /** The indexes of this section's lines after its heading. */
  from: number;
  to: number;
}

interface Analysis {
  lines: Line[];
  pairs: Pair[];
  sections: Section[];
  quickEnd: number | null;
}

const marker = /^<!-- discretion:([a-z-]+):(start|end) -->$/;
const quickMarker = "<!-- roots:quick-notes:end -->";
const heading = /^ {0,3}(#{1,6})[ \t]+(.*?)[ \t]*$/;
const recoveredTitle = "Recovered";

function analyse(texts: string[], findQuick: boolean): Analysis {
  const lines: Line[] = [];
  let fence: { char: string; size: number } | null = null;
  for (const text of texts) {
    const open = /^ {0,3}(`{3,}|~{3,})/.exec(text);
    let inFence = fence !== null;
    let opens = false;
    let closes = false;
    if (fence === null && open !== null) {
      fence = { char: (open[1] as string)[0] as string, size: (open[1] as string).length };
      inFence = true;
      opens = true;
    } else if (fence !== null) {
      const close = /^ {0,3}(`{3,}|~{3,})\s*$/.exec(text);
      if (
        close !== null &&
        (close[1] as string)[0] === fence.char &&
        (close[1] as string).length >= fence.size
      ) {
        fence = null;
        closes = true;
      }
    }
    lines.push({ text, inFence, opens, closes, tag: "text" });
  }
  const pairs: Pair[] = [];
  const found = (at: number): RegExpExecArray | null =>
    lines[at]?.inFence === true ? null : marker.exec((lines[at] as Line).text);
  for (let at = 0; at < lines.length; at++) {
    const m = found(at);
    if (m === null) continue;
    let end = -1;
    if (m[2] === "start") {
      for (let to = at + 1; to < lines.length; to++) {
        const n = found(to);
        if (n !== null && n[1] === m[1] && n[2] === "end") {
          end = to;
          break;
        }
        if (n !== null && n[1] === m[1] && n[2] === "start") break;
      }
    }
    if (end < 0) {
      (lines[at] as Line).tag = "orphan";
    } else {
      pairs.push({ name: m[1] as string, start: at, end });
      for (let k = at; k <= end; k++) (lines[k] as Line).tag = "pair";
      at = end;
    }
  }
  let quickEnd: number | null = null;
  if (findQuick) {
    const at = lines.findIndex((l) => l.tag === "text" && !l.inFence && l.text === quickMarker);
    if (at >= 0) {
      quickEnd = at;
      (lines[at] as Line).tag = "quick-end";
    }
  }
  const sections: Section[] = [];
  let open: Section = { level: 0, title: "", heading: null, from: 0, to: 0 };
  for (let at = 0; at < lines.length; at++) {
    const line = lines[at] as Line;
    const h = line.tag === "text" && !line.inFence ? heading.exec(line.text) : null;
    if (h === null) continue;
    open.to = at;
    sections.push(open);
    open = {
      level: (h[1] as string).length,
      title: h[2] as string,
      heading: at,
      from: at + 1,
      to: lines.length,
    };
  }
  open.to = lines.length;
  sections.push(open);
  return { lines, pairs, sections, quickEnd };
}

/** The lines directly above the quick-notes end marker that are list items, blanks inside. */
function quickRange(a: Analysis): [number, number] | null {
  if (a.quickEnd === null) return null;
  let first = -1;
  let last = -1;
  for (let at = a.quickEnd - 1; at >= 0; at--) {
    const line = a.lines[at] as Line;
    if (line.tag !== "text" || line.inFence) break;
    if (/^\s*-\s/.test(line.text)) {
      if (last < 0) last = at;
      first = at;
    } else if (line.text.trim() !== "") {
      break;
    }
  }
  return first < 0 ? null : [first, last];
}

interface Unit {
  lines: string[];
  key: string;
  start: number;
  end: number;
}

/** The units of a section's text: a fenced block as one, every other non-blank line alone. */
function units(a: Analysis, section: Section): Unit[] {
  const out: Unit[] = [];
  const text = (at: number): Line => a.lines[at] as Line;
  for (let at = section.from; at < section.to; at++) {
    const line = text(at);
    if (line.tag !== "text" || line.text.trim() === "") continue;
    let end = at;
    if (line.opens) {
      while (end + 1 < section.to && !text(end).closes && text(end + 1).tag === "text") end++;
    }
    const texts: string[] = [];
    for (let k = at; k <= end; k++) texts.push(text(k).text);
    out.push({ lines: texts, key: texts.map((l) => l.trimEnd()).join("\n"), start: at, end });
    at = end;
  }
  return out;
}

const blank = (lines: string[]): boolean => lines.every((l) => l.trim() === "");
const trimEdges = (lines: string[]): string[] => {
  let from = 0;
  let to = lines.length;
  while (from < to && (lines[from] as string).trim() === "") from++;
  while (to > from && (lines[to - 1] as string).trim() === "") to--;
  return lines.slice(from, to);
};

const sectionKey = (s: Section): string => `${s.level}|${s.title}`;

interface Item {
  label: string;
  lines: string[];
}

const fmText = (blocks: ParsedFrontmatter["blocks"]): string =>
  ["---", ...blocks.flatMap((b) => b.lines), "---"].join("\n");

/** `fresh` with everything Pranshul wrote in `existing` carried over; nothing is dropped. */
export function repairText(existing: string, fresh: string): string {
  const old = parseFrontmatter(existing.replace(/\r\n?/g, "\n"));
  const now = parseFrontmatter(fresh.replace(/\r\n?/g, "\n"));
  const items: Item[] = [];

  // Frontmatter: the template's keys with the note's values.
  let head: string | null;
  if (!now.present) {
    head = old.present && old.error === null ? fmText(old.blocks) : null;
  } else if (old.present && old.error === null) {
    head = mergeFrontmatter(old, now);
  } else {
    head = fmText(now.blocks);
  }
  if (old.present && old.error !== null) {
    items.push({
      label: "Frontmatter that could not be read",
      lines: ["````yaml", ...old.raw.split("\n"), "````"],
    });
  }

  const oldLines = (old.present ? old.body : existing.replace(/\r\n?/g, "\n")).split("\n");
  const newLines = now.body.split("\n");
  const was = analyse(oldLines, true);
  const fresher = analyse(newLines, true);

  // What the template itself says, by section and overall.
  const bySection = new Map<string, Map<string, number>>();
  const overall = new Map<string, number>();
  const count = (map: Map<string, number>, key: string, by: number): void => {
    map.set(key, (map.get(key) ?? 0) + by);
  };
  const seen = new Map<string, number>();
  const idOf = (s: Section): string => {
    const key = sectionKey(s);
    const n = seen.get(key) ?? 0;
    seen.set(key, n + 1);
    return `${key}#${n}`;
  };
  const freshId = new Map<Section, string>();
  for (const s of fresher.sections) {
    const id = idOf(s);
    freshId.set(s, id);
    const own = new Map<string, number>();
    for (const u of units(fresher, s)) {
      count(own, u.key, 1);
      count(overall, u.key, 1);
    }
    bySection.set(id, own);
  }

  // The note's sections, with the Recovered section of an earlier repair set apart.
  seen.clear();
  let recovered: string[] = [];
  const mine: { section: Section; id: string }[] = [];
  let inRecovered = false;
  for (const s of was.sections) {
    if (s.level === 2 && s.title === recoveredTitle) {
      inRecovered = true;
      recovered = trimEdges(oldLines.slice(s.from, s.to));
      continue;
    }
    if (inRecovered && s.level > 2) {
      recovered = trimEdges([...recovered, ...oldLines.slice(s.heading ?? s.from, s.to)]);
      continue;
    }
    inRecovered = false;
    mine.push({ section: s, id: idOf(s) });
  }

  // Quick notes lines are carried apart; pairs are carried by name.
  const quick = quickRange(was);
  if (quick !== null) {
    for (let at = quick[0]; at <= quick[1]; at++) (was.lines[at] as Line).tag = "quick";
  }

  // Classify each unit of the note: the template's own, or Pranshul's.
  const custom = new Map<string, { lines: string[]; gap: boolean }[]>();
  const leftovers: { id: string; unit: Unit }[] = [];
  for (const { section, id } of mine) {
    const own = bySection.get(id);
    for (const u of units(was, section)) {
      const left = own?.get(u.key) ?? 0;
      if (left > 0) {
        count(own as Map<string, number>, u.key, -1);
        count(overall, u.key, -1);
      } else {
        leftovers.push({ id, unit: u });
      }
    }
  }
  const authored: { id: string; unit: Unit }[] = [];
  for (const entry of leftovers) {
    if ((overall.get(entry.unit.key) ?? 0) > 0) count(overall, entry.unit.key, -1);
    else authored.push(entry);
  }
  const lastEnd = new Map<string, number>();
  for (const { id, unit } of authored) {
    const list = custom.get(id) ?? [];
    const before = lastEnd.get(id);
    list.push({ lines: unit.lines, gap: before !== undefined && unit.start - before > 1 });
    lastEnd.set(id, unit.end);
    custom.set(id, list);
  }

  // Pairs: the note's content goes into the template's pair of the same name and order.
  const used = new Map<string, number>();
  const freshPairs = new Map<string, Pair[]>();
  for (const p of fresher.pairs) freshPairs.set(p.name, [...(freshPairs.get(p.name) ?? []), p]);
  const fills: { pair: Pair; content: string[] }[] = [];
  for (const p of was.pairs) {
    const content = oldLines.slice(p.start + 1, p.end);
    const n = used.get(p.name) ?? 0;
    used.set(p.name, n + 1);
    const target = freshPairs.get(p.name)?.[n];
    if (target === undefined) {
      if (!blank(content)) items.push({ label: `discretion:${p.name}`, lines: trimEdges(content) });
    } else if (!blank(content)) {
      fills.push({ pair: target, content });
    }
  }

  // Build the new body: fill pairs, then quick lines, from the bottom up so indexes hold.
  const out = [...newLines];
  const edits: { at: number; remove: number; add: string[] }[] = fills.map((f) => ({
    at: f.pair.start + 1,
    remove: f.pair.end - f.pair.start - 1,
    add: f.content,
  }));
  if (quick !== null) {
    const lines = oldLines.slice(quick[0], quick[1] + 1);
    if (fresher.quickEnd === null) items.push({ label: "roots:quick-notes", lines });
    else edits.push({ at: fresher.quickEnd, remove: 0, add: lines });
  }
  const placements: { at: number; remove: number; add: string[] }[] = [];
  for (const s of fresher.sections) {
    const list = custom.get(freshId.get(s) as string);
    if (list === undefined) continue;
    let to = s.to;
    while (to > s.from && (newLines[to - 1] as string).trim() === "") to--;
    const block: string[] = [];
    if (to > 0 && (newLines[to - 1] as string).trim() !== "") block.push("");
    list.forEach((u, at) => {
      if (at > 0 && u.gap) block.push("");
      block.push(...u.lines);
    });
    if (to === s.to && s.to < newLines.length) block.push("");
    placements.push({ at: to, remove: 0, add: block });
  }
  // A section's text goes at its end, after anything filled into its pairs or quick notes.
  const ordered = [...edits, ...placements].sort((a, b) => b.at - a.at);
  for (const e of ordered) out.splice(e.at, e.remove, ...e.add);

  // What the template has no place for.
  for (const { section, id } of mine) {
    if (freshId.size > 0 && [...freshId.values()].includes(id)) continue;
    const list = custom.get(id);
    if (list === undefined) continue;
    const lines = list.flatMap((u, at) => (at > 0 && u.gap ? ["", ...u.lines] : u.lines));
    items.push({
      label: section.heading === null ? "Text before the first heading" : section.title,
      lines,
    });
  }

  const tail: string[] = [];
  const keep = recovered;
  if (keep.length > 0) tail.push(...keep);
  for (const item of items) {
    if (tail.length > 0) tail.push("");
    tail.push(`### ${item.label}`, "", ...item.lines);
  }
  let body = out.join("\n");
  if (tail.length > 0)
    body = `${body.replace(/\n*$/, "")}\n\n## ${recoveredTitle}\n\n${tail.join("\n")}`;
  const text = `${head === null ? "" : `${head}\n`}${body}`;
  return `${text.replace(/\n*$/, "")}\n`;
}
