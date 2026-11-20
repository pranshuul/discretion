"use strict";
// Roots' renderer for Templater, built from packages/roots/src by `pnpm --filter @discretion/roots bundle`.
// Do not edit: install replaces this file.
(function () {
  var outer = typeof require === 'function' ? require : function (name) {
    throw new Error('Cannot find module ' + name);
  };
  var definitions = {
    "dates": function (exports, require) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isoWeekOf = isoWeekOf;
exports.periodOf = periodOf;
exports.notePath = notePath;
exports.noteTitle = noteTitle;
exports.noteLinks = noteLinks;
exports.dateFromName = dateFromName;
exports.questionFor = questionFor;
const errors_js_1 = require("./errors.js");
const weekdays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const months = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
];
const pad = (n, width = 2) => String(n).padStart(width, "0");
const msPerDay = 86_400_000;
/** Days since 1970-01-01 of a real calendar date `YYYY-MM-DD`; throws for anything else. */
function toDays(date) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
    const ms = match ? Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : NaN;
    if (match === null || new Date(ms).toISOString().slice(0, 10) !== date) {
        throw new errors_js_1.RootsError("D2013", `${JSON.stringify(date)} is not a date.`, "Give a real calendar date as YYYY-MM-DD.");
    }
    return ms / msPerDay;
}
const fromDays = (days) => new Date(days * msPerDay).toISOString().slice(0, 10);
/** 0 for Monday to 6 for Sunday. */
const weekdayOf = (days) => (((days + 3) % 7) + 7) % 7;
const parts = (date) => {
    toDays(date);
    return { y: Number(date.slice(0, 4)), m: Number(date.slice(5, 7)), d: Number(date.slice(8, 10)) };
};
/** The ISO 8601 week-year and week number of `date` (`YYYY-MM-DD`). */
function isoWeekOf(date) {
    const days = toDays(date);
    const thursday = days - weekdayOf(days) + 3;
    const year = Number(fromDays(thursday).slice(0, 4));
    const jan1 = toDays(`${pad(year, 4)}-01-01`);
    return { year, week: Math.floor((thursday - jan1) / 7) + 1 };
}
const weeksInYear = (year) => isoWeekOf(`${pad(year, 4)}-12-28`).week;
/** The Monday of ISO week `week` of week-year `year`. */
function mondayOf(year, week) {
    const jan4 = toDays(`${pad(year, 4)}-01-04`);
    return fromDays(jan4 - weekdayOf(jan4) + (week - 1) * 7);
}
const lastOfMonth = (y, m) => fromDays(Date.UTC(y, m, 1) / msPerDay - 1);
/** The first and last day of the note's period; both are `date` for daily and home. */
function periodOf(kind, date) {
    const { y, m } = parts(date);
    switch (kind) {
        case "daily":
        case "home":
            return { from: date, to: date };
        case "weekly": {
            const days = toDays(date);
            const monday = days - weekdayOf(days);
            return { from: fromDays(monday), to: fromDays(monday + 6) };
        }
        case "monthly":
            return { from: `${pad(y, 4)}-${pad(m)}-01`, to: lastOfMonth(y, m) };
        case "quarterly": {
            const first = Math.floor((m - 1) / 3) * 3 + 1;
            return { from: `${pad(y, 4)}-${pad(first)}-01`, to: lastOfMonth(y, first + 2) };
        }
        case "yearly":
            return { from: `${pad(y, 4)}-01-01`, to: `${pad(y, 4)}-12-31` };
    }
}
const quarterOf = (date) => Math.floor((parts(date).m - 1) / 3) + 1;
/** The note's path from the vault root, such as `1-Roots/Daily/2026/11/2026-11-05.md`. */
function notePath(kind, date) {
    const { y, m } = parts(date);
    const year = pad(y, 4);
    switch (kind) {
        case "daily":
            return `1-Roots/Daily/${year}/${pad(m)}/${date}.md`;
        case "weekly": {
            const week = isoWeekOf(date);
            return `1-Roots/Weekly/${pad(week.year, 4)}/${pad(week.year, 4)}-W${pad(week.week)}.md`;
        }
        case "monthly":
            return `1-Roots/Monthly/${year}/${year}-${pad(m)}.md`;
        case "quarterly":
            return `1-Roots/Quarterly/${year}/${year}-Q${quarterOf(date)}.md`;
        case "yearly":
            return `1-Roots/Yearly/${year}.md`;
        case "home":
            return "1-Roots/Roots.md";
    }
}
/** The text after the `#` of the note's title line. */
function noteTitle(kind, date) {
    const { y, m, d } = parts(date);
    switch (kind) {
        case "daily":
            return `${weekdays[weekdayOf(toDays(date))]} ${d} ${months[m - 1]} ${y}`;
        case "weekly": {
            const week = isoWeekOf(date);
            return `Week ${week.week}, ${week.year}`;
        }
        case "monthly":
            return `${months[m - 1]} ${y}`;
        case "quarterly":
            return `${y} Q${quarterOf(date)}`;
        case "yearly":
            return String(y);
        case "home":
            return "Roots";
    }
}
const target = (kind, date) => notePath(kind, date).replace(/\.md$/, "");
const link = (kind, date, label) => `[[${target(kind, date)}|${label}]]`;
const shift = (date, days) => fromDays(toDays(date) + days);
/** The line linking the note's neighbours; empty for home. */
function noteLinks(kind, date) {
    const { from, to } = periodOf(kind, date);
    const before = shift(from, -1);
    const after = shift(to, 1);
    switch (kind) {
        case "daily":
            return [
                link("daily", before, "← Yesterday"),
                link("weekly", date, "This week"),
                link("daily", after, "Tomorrow →"),
            ].join(" · ");
        case "weekly": {
            const touched = [from, to]
                .map((day) => parts(day))
                .filter((p, at, all) => all.findIndex((q) => q.m === p.m && q.y === p.y) === at)
                .map((p) => link("monthly", `${pad(p.y, 4)}-${pad(p.m)}-01`, `${months[p.m - 1]} ${p.y}`));
            return [
                link("weekly", before, "← Previous week"),
                link("weekly", after, "Next week →"),
                ...touched,
            ].join(" · ");
        }
        case "monthly":
            return [
                link("monthly", before, "← Previous month"),
                link("monthly", after, "Next month →"),
                link("yearly", date, String(parts(date).y)),
            ].join(" · ");
        case "quarterly":
            return [
                link("quarterly", before, "← Previous quarter"),
                link("quarterly", after, "Next quarter →"),
            ].join(" · ");
        case "yearly":
            return [link("yearly", before, "← Previous year"), link("yearly", after, "Next year →")].join(" · ");
        case "home":
            return "";
    }
}
/** The first day of the period a note named `name` (no extension) covers, or null. */
function dateFromName(kind, name) {
    const valid = (date) => {
        try {
            toDays(date);
            return date;
        }
        catch {
            return null;
        }
    };
    switch (kind) {
        case "daily":
            return valid(name);
        case "weekly": {
            const match = /^(\d{4})-W(\d{2})$/.exec(name);
            if (match === null)
                return null;
            const [year, week] = [Number(match[1]), Number(match[2])];
            return week >= 1 && week <= weeksInYear(year) ? mondayOf(year, week) : null;
        }
        case "monthly": {
            const match = /^(\d{4})-(\d{2})$/.exec(name);
            return match !== null && Number(match[2]) >= 1 && Number(match[2]) <= 12
                ? `${name}-01`
                : null;
        }
        case "quarterly": {
            const match = /^(\d{4})-Q([1-4])$/.exec(name);
            return match === null ? null : `${match[1]}-${pad((Number(match[2]) - 1) * 3 + 1)}-01`;
        }
        case "yearly":
            return /^\d{4}$/.test(name) ? `${name}-01-01` : null;
        case "home":
            return null;
    }
}
const daysBefore = [0, 31, 60, 91, 121, 152, 182, 213, 244, 274, 305, 335];
/** The prompt for `date` from the text of `questions.md`, found by leap-year position. */
function questionFor(questions, date) {
    const { m, d } = parts(date);
    const position = daysBefore[m - 1] + d;
    for (const line of questions.split("\n")) {
        const match = /^(\d+)\. (.+)$/.exec(line);
        if (match !== null && Number(match[1]) === position)
            return match[2].trimEnd();
    }
    throw new errors_js_1.RootsError("D2011", `1-Roots/_roots/questions.md has no question ${position}, the prompt for ${date}.`, "Add the missing prompt, or delete questions.md and run discretion roots install to write the default list.");
}
    },
    "diff": function (exports, require) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.unifiedDiff = unifiedDiff;
/** The line-by-line edit script from `a` to `b`, from their longest common subsequence. */
function edits(a, b) {
    const table = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
    const cell = (i, j) => table[i][j];
    for (let i = a.length - 1; i >= 0; i--) {
        for (let j = b.length - 1; j >= 0; j--) {
            table[i][j] =
                a[i] === b[j] ? cell(i + 1, j + 1) + 1 : Math.max(cell(i + 1, j), cell(i, j + 1));
        }
    }
    const out = [];
    let i = 0;
    let j = 0;
    while (i < a.length || j < b.length) {
        if (i < a.length && j < b.length && a[i] === b[j]) {
            out.push({ op: " ", line: a[i] });
            i++;
            j++;
        }
        else if (j >= b.length || (i < a.length && cell(i + 1, j) >= cell(i, j + 1))) {
            out.push({ op: "-", line: a[i] });
            i++;
        }
        else {
            out.push({ op: "+", line: b[j] });
            j++;
        }
    }
    return out;
}
const context = 3;
/** The hunks of an edit script, with three lines of context around each change. */
function hunks(all) {
    const keep = all.map((_, at) => all.slice(Math.max(0, at - context), at + context + 1).some((e) => e.op !== " "));
    const lines = [];
    let oldAt = 1;
    let newAt = 1;
    let at = 0;
    while (at < all.length) {
        if (!keep[at]) {
            const e = all[at];
            if (e.op !== "+")
                oldAt++;
            if (e.op !== "-")
                newAt++;
            at++;
            continue;
        }
        const hunkOld = oldAt;
        const hunkNew = newAt;
        let oldCount = 0;
        let newCount = 0;
        const body = [];
        while (at < all.length && keep[at]) {
            const e = all[at];
            body.push(`${e.op}${e.line}`);
            if (e.op !== "+")
                oldCount++;
            if (e.op !== "-")
                newCount++;
            at++;
        }
        oldAt += oldCount;
        newAt += newCount;
        lines.push(`@@ -${hunkOld},${oldCount} +${hunkNew},${newCount} @@`, ...body);
    }
    return lines;
}
const split = (text) => {
    const lines = text.split("\n");
    if (lines[lines.length - 1] === "")
        lines.pop();
    return lines;
};
/** A unified diff from `before` to `after`; empty when they are equal. */
function unifiedDiff(before, after, beforeLabel, afterLabel) {
    if (before === after)
        return "";
    const body = hunks(edits(split(before), split(after)));
    return `--- ${beforeLabel}\n+++ ${afterLabel}\n${body.join("\n")}\n`;
}
    },
    "errors": function (exports, require) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RootsError = void 0;
/** A refusal from the renderer: a stable code, a message and a remedy line. */
class RootsError extends Error {
    code;
    remedy;
    constructor(code, message, remedy) {
        super(message);
        this.name = "RootsError";
        this.code = code;
        this.remedy = remedy;
    }
}
exports.RootsError = RootsError;
    },
    "fill": function (exports, require) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.fixedPlaceholders = void 0;
exports.fillWith = fillWith;
const kinds_js_1 = require("./kinds.js");
const queries_js_1 = require("./queries.js");
/** The placeholders that take a value from the renderer. */
exports.fixedPlaceholders = ["title", "links", "date", "question", "frontmatter"];
/**
 * Fills the placeholders of a template in one pass: `{{title}}`, `{{links}}`, `{{date}}`,
 * `{{question}}`, `{{frontmatter}}` and `{{query:<name>}}`. Everything else is copied as
 * written. A placeholder that is not known, or that has no value, stays in the text as
 * visible `{{name}}` and is reported in `unknown`.
 */
function fillWith(template, values, snippets) {
    const unknown = [];
    const text = template.replace(/\{\{([^{}\n]+)\}\}/g, (whole, name) => {
        let filled;
        if (name.startsWith("query:")) {
            const query = name.slice("query:".length);
            if (kinds_js_1.queryNames.includes(query))
                filled = (0, queries_js_1.queryBlockFrom)(snippets, query);
        }
        else if (exports.fixedPlaceholders.includes(name)) {
            filled = values[name];
        }
        if (filled === undefined) {
            if (!unknown.includes(name))
                unknown.push(name);
            return whole;
        }
        return filled;
    });
    return { text, unknown };
}
    },
    "frontmatter": function (exports, require) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.frontmatterFor = frontmatterFor;
exports.requiredKeys = requiredKeys;
exports.parseFrontmatter = parseFrontmatter;
exports.mergeFrontmatter = mergeFrontmatter;
const dates_js_1 = require("./dates.js");
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
function frontmatterFor(kind, date) {
    const lines = ["---", "roots: 1"];
    if (kind === "daily") {
        lines.push(`date: ${date}`, "rating:", "alias:", "aiRating:", "aiAlias:", "discretion: 1", "habits: {}", "habitTimes: {}", "habitMinutes: {}", "habitSource: {}", "skipReasons: {}");
    }
    else {
        lines.push(`kind: ${kind}`);
        if (kind !== "home") {
            const { from, to } = (0, dates_js_1.periodOf)(kind, date);
            lines.push(`from: ${from}`, `to: ${to}`);
        }
        if (kind === "weekly")
            lines.push("wheel:", ...wheelAreas.map((area) => `  ${area}:`));
    }
    lines.push("---");
    return lines.join("\n");
}
/** The keys a note kind's frontmatter must have. */
function requiredKeys(kind) {
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
function parseFrontmatter(text) {
    if (!text.startsWith("---\n")) {
        return { present: false, blocks: [], body: text, raw: "", error: null };
    }
    const lines = text.split("\n");
    const close = lines.findIndex((line, at) => at > 0 && line === "---");
    const raw = lines.slice(1, close < 0 ? undefined : close).join("\n");
    const fail = (error, body) => ({
        present: true,
        blocks: [],
        body,
        raw,
        error,
    });
    if (close < 0)
        return fail("the frontmatter is not closed: there is no closing --- line", "");
    const body = lines.slice(close + 1).join("\n");
    const blocks = [];
    for (let at = 1; at < close; at++) {
        const line = lines[at];
        const number = at + 1;
        if (/^[ ]*\t/.test(line))
            return fail(`line ${number} indents with a tab`, body);
        const key = keyLine.exec(line);
        const last = blocks[blocks.length - 1];
        if (key !== null) {
            blocks.push({ key: key[1] ?? key[2] ?? key[3] ?? "", lines: [line] });
        }
        else if (line.trim() === "" || line.startsWith("#")) {
            if (last === undefined)
                blocks.push({ key: "", lines: [line] });
            else
                last.lines.push(line);
        }
        else if (line.startsWith(" ") || line === "-" || line.startsWith("- ")) {
            if (last === undefined)
                return fail(`line ${number} belongs to no key`, body);
            last.lines.push(line);
        }
        else {
            return fail(`line ${number} is not "key: value": ${line}`, body);
        }
    }
    return { present: true, blocks, body, raw, error: null };
}
const isEmptyValue = (block) => {
    const value = block.lines[0].replace(/^[^:]*:/, "").trim();
    const rest = block.lines.slice(1).filter((line) => line.trim() !== "");
    return ["", "{}", "[]", "null", "~"].includes(value) && rest.length === 0;
};
/** The nested keys of a block that is a map of maps' children, or null when it is not one. */
function children(block) {
    const head = block.lines[0].replace(/^[^:]*:/, "").trim();
    const rest = block.lines.slice(1).filter((line) => line.trim() !== "");
    if (head !== "" || rest.length === 0)
        return null;
    const indent = /^ */.exec(rest[0])?.[0].length ?? 0;
    const out = [];
    for (const line of block.lines.slice(1)) {
        const own = /^ */.exec(line)?.[0].length ?? 0;
        const key = own === indent ? keyLine.exec(line.slice(indent)) : null;
        if (key !== null) {
            out.push({ key: key[1] ?? key[2] ?? key[3] ?? "", lines: [line] });
        }
        else if (out.length > 0 && (line.trim() === "" || own > indent)) {
            out[out.length - 1].lines.push(line);
        }
        else {
            return null;
        }
    }
    return out;
}
function mergeBlock(existing, fresh) {
    const freshKids = children(fresh);
    if (freshKids === null)
        return existing;
    if (isEmptyValue(existing))
        return fresh;
    const existingKids = children(existing);
    if (existingKids === null)
        return existing;
    const used = new Set();
    const merged = freshKids.map((kid) => {
        const mine = existingKids.find((k) => k.key === kid.key && !used.has(k));
        if (mine === undefined)
            return kid;
        used.add(mine);
        return mine;
    });
    const extra = existingKids.filter((k) => !used.has(k));
    return {
        key: existing.key,
        lines: [existing.lines[0], ...[...merged, ...extra].flatMap((k) => k.lines)],
    };
}
/** `fresh`'s keys with `existing`'s values; keys only `existing` has are kept at the end. */
function mergeFrontmatter(existing, fresh) {
    const unused = new Set(existing.blocks);
    const out = existing.blocks.filter((b) => b.key === "");
    for (const block of out)
        unused.delete(block);
    for (const block of fresh.blocks) {
        const mine = existing.blocks.find((b) => b.key === block.key && unused.has(b));
        if (mine === undefined) {
            out.push(block);
        }
        else {
            unused.delete(mine);
            out.push(mergeBlock(mine, block));
        }
    }
    for (const block of existing.blocks)
        if (unused.has(block))
            out.push(block);
    return ["---", ...out.flatMap((b) => b.lines), "---"].join("\n");
}
    },
    "kinds": function (exports, require) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.queryNames = exports.noteKinds = void 0;
exports.noteKinds = ["daily", "weekly", "monthly", "quarterly", "yearly", "home"];
/** The names `{{query:<name>}}` accepts. */
exports.queryNames = [
    "ratings-bars",
    "ratings-trend",
    "logs",
    "days",
    "habits",
    "heatmap",
    "wheel-progression",
    "notes-below",
    "home-today",
    "home-week",
    "home-streaks",
    "home-trend",
];
    },
    "launch": function (exports, require) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createLauncher = createLauncher;
const dates_js_1 = require("./dates.js");
const diff_js_1 = require("./diff.js");
const render_js_1 = require("./render.js");
const repair_js_1 = require("./repair.js");
const kindsOf = ["daily", "weekly", "monthly", "quarterly", "yearly", "home"];
/** Shows the diff, and resolves true only when Apply is pressed. */
function confirmDiff(tp, app, diff) {
    const obsidian = (tp.obsidian ?? require("obsidian"));
    return new Promise((resolve) => {
        let decided = false;
        const decide = (value, close) => {
            if (decided)
                return;
            decided = true;
            resolve(value);
            close();
        };
        class RepairModal extends obsidian.Modal {
            constructor() {
                super(app);
            }
            onOpen() {
                this.contentEl.createEl("h3", { text: "Repair this note" });
                this.contentEl.createEl("pre", { text: diff });
                const apply = this.contentEl.createEl("button", { text: "Apply" });
                apply.addEventListener("click", () => decide(true, () => this.close()));
                const cancel = this.contentEl.createEl("button", { text: "Cancel" });
                cancel.addEventListener("click", () => decide(false, () => this.close()));
            }
            onClose() {
                decide(false, () => undefined);
            }
        }
        new RepairModal().open();
    });
}
/** The function Templater calls as `tp.user.roots(tp)`. */
function createLauncher(snippets) {
    return async (tp) => {
        const app = tp.app;
        const config = tp.config;
        const file = tp.file;
        const launcher = config.template_file?.basename ?? "";
        const now = tp.date.now("YYYY-MM-DD");
        const read = (path) => app.vault.adapter.read(path).catch(() => null);
        if (launcher === "today") {
            const path = (0, dates_js_1.notePath)("daily", now);
            if (!(await app.vault.adapter.exists(path))) {
                const text = await (0, render_js_1.renderNote)("daily", now, read, snippets);
                const parts = path.split("/").slice(0, -1);
                for (let at = 1; at <= parts.length; at++) {
                    const folder = parts.slice(0, at).join("/");
                    if (!(await app.vault.adapter.exists(folder)))
                        await app.vault.adapter.mkdir(folder);
                }
                await app.vault.create(path, text);
            }
            await app.workspace.openLinkText(path, "", false);
            return "";
        }
        if (launcher === "repair") {
            const active = app.workspace.getActiveFile();
            if (active === null)
                return "";
            const existing = await app.vault.read(active);
            const found = (0, repair_js_1.identifyNote)(active.path, existing);
            if (found === null)
                return "";
            const fresh = await (0, render_js_1.renderNote)(found.kind, found.date, read, snippets);
            const repaired = (0, repair_js_1.repairText)(existing, fresh);
            if (repaired === existing)
                return "";
            const diff = (0, diff_js_1.unifiedDiff)(existing, repaired, active.path, `${active.path} (repaired)`);
            if (await confirmDiff(tp, app, diff))
                await app.vault.modify(active, repaired);
            return "";
        }
        const kind = kindsOf.find((k) => k === launcher);
        if (kind === undefined)
            return "";
        if (typeof file.content === "string" && file.content.trim() !== "")
            return "";
        const date = (0, dates_js_1.dateFromName)(kind, file.title) ?? now;
        return (0, render_js_1.renderNote)(kind, date, read, snippets);
    };
}
    },
    "queries": function (exports, require) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.queryBlockFrom = queryBlockFrom;
/** A snippet of DESIGN.md's Recap queries, without its final newline. */
function snippet(snippets, name) {
    const text = snippets[name];
    if (text === undefined)
        throw new Error(`there is no query snippet ${name}`);
    return text.replace(/\n$/, "");
}
/** `source` with its one `const <name> = "<default>";` line set to `value`. */
function setting(source, name, fallback, value) {
    const line = `const ${name} = "${fallback}";`;
    if (!source.includes(line))
        throw new Error(`snippet has no ${line}`);
    return source.replace(line, `const ${name} = "${value}";`);
}
const block = (...parts) => ["```dataviewjs", parts.join("\n\n"), "```"].join("\n");
/** A complete `dataviewjs` block for a query: its preamble, helpers and body. */
function queryBlockFrom(snippets, name) {
    const s = (part) => snippet(snippets, part);
    const home = (range) => setting(s("home-preamble"), "range", "week", range);
    const trend = () => setting(s("ratings"), "mode", "bars", "trend");
    switch (name) {
        case "ratings-bars":
            return block(s("preamble"), s("rating-chart"), s("ratings"));
        case "ratings-trend":
            return block(s("preamble"), s("rating-chart"), trend());
        case "logs":
            return block(s("preamble"), s("logs"));
        case "days":
            return block(s("preamble"), s("days"));
        case "habits":
            return block(s("preamble"), s("streak"), s("habits"));
        case "heatmap":
            return block(s("preamble"), s("heatmap"));
        case "wheel-progression":
            return block(s("preamble"), s("wheel-progression"));
        case "notes-below":
            return block(s("preamble"), s("notes-below"));
        case "home-today":
            return block(home("today"), s("today"));
        case "home-week":
            return block(home("week"), s("rating-chart"), s("ratings"));
        case "home-streaks":
            return block(home("all"), s("streak"), s("streaks"));
        case "home-trend":
            return block(home("30 days"), s("rating-chart"), trend());
    }
}
    },
    "render": function (exports, require) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.questionsPath = void 0;
exports.templatePath = templatePath;
exports.renderReport = renderReport;
exports.render = render;
exports.renderNote = renderNote;
const dates_js_1 = require("./dates.js");
const errors_js_1 = require("./errors.js");
const fill_js_1 = require("./fill.js");
const frontmatter_js_1 = require("./frontmatter.js");
exports.questionsPath = "1-Roots/_roots/questions.md";
/** Where a note kind's template lives in the vault. */
function templatePath(kind) {
    return `1-Roots/_roots/templates/${kind}.md`;
}
/** The note's full text, and the placeholders it could not fill. */
function renderReport(kind, date, ctx) {
    const template = ctx.template.replace(/\r\n?/g, "\n");
    const { from } = (0, dates_js_1.periodOf)(kind, date);
    const filled = (0, fill_js_1.fillWith)(template, {
        title: (0, dates_js_1.noteTitle)(kind, date),
        links: (0, dates_js_1.noteLinks)(kind, date),
        date: kind === "daily" || kind === "home" ? date : from,
        question: template.includes("{{question}}") ? (0, dates_js_1.questionFor)(ctx.questions, date) : "",
        frontmatter: (0, frontmatter_js_1.frontmatterFor)(kind, date),
    }, ctx.snippets);
    return { text: `${filled.text.replace(/\n+$/, "")}\n`, unknown: filled.unknown };
}
/** The note's full text for `kind` on `date`: deterministic, `\n` lines, a final newline. */
function render(kind, date, ctx) {
    return renderReport(kind, date, ctx).text;
}
/** Reads the template and questions through `read`, then renders. */
async function renderNote(kind, date, read, snippets) {
    const template = await read(templatePath(kind));
    const questions = await read(exports.questionsPath);
    const missing = template === null ? templatePath(kind) : questions === null ? exports.questionsPath : null;
    if (missing !== null || template === null || questions === null) {
        throw new errors_js_1.RootsError("D2011", `${missing ?? templatePath(kind)} is missing, so the ${kind} note cannot be rendered.`, "Run discretion roots install to lay out Roots in the vault.");
    }
    return render(kind, date, { template, questions, snippets });
}
    },
    "repair": function (exports, require) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.identifyNote = identifyNote;
exports.repairText = repairText;
const dates_js_1 = require("./dates.js");
const frontmatter_js_1 = require("./frontmatter.js");
/** Home has no date; the renderer needs one only for a template that names it. */
const homeDate = "1970-01-01";
/** The kind and date of the note at `path`, from its name or else its frontmatter. */
function identifyNote(path, text) {
    const name = (path.split("/").pop() ?? "").replace(/\.md$/, "");
    const byName = ["daily", "weekly", "quarterly", "monthly", "yearly"];
    for (const kind of byName) {
        const date = (0, dates_js_1.dateFromName)(kind, name);
        if (date !== null)
            return { kind, date };
    }
    if (name === "Roots" && (path === "Roots.md" || path.endsWith("/Roots.md"))) {
        return { kind: "home", date: homeDate };
    }
    const fm = (0, frontmatter_js_1.parseFrontmatter)(text.replace(/\r\n?/g, "\n"));
    const value = (key) => fm.blocks
        .find((b) => b.key === key)
        ?.lines[0]?.replace(/^[^:]*:/, "")
        .trim()
        .replace(/^["']|["']$/g, "");
    const valid = (date) => {
        if (date === undefined || !/^\d{4}-\d{2}-\d{2}$/.test(date))
            return false;
        try {
            (0, dates_js_1.periodOf)("daily", date);
            return true;
        }
        catch {
            return false;
        }
    };
    const kind = value("kind");
    if (kind === "home")
        return { kind: "home", date: homeDate };
    if (kind !== undefined && ["weekly", "monthly", "quarterly", "yearly"].includes(kind)) {
        const from = value("from");
        return valid(from) ? { kind: kind, date: from } : null;
    }
    const date = value("date");
    return kind === undefined && valid(date) ? { kind: "daily", date } : null;
}
const marker = /^<!-- discretion:([a-z-]+):(start|end) -->$/;
const quickMarker = "<!-- roots:quick-notes:end -->";
const heading = /^ {0,3}(#{1,6})[ \t]+(.*?)[ \t]*$/;
const recoveredTitle = "Recovered";
function analyse(texts, findQuick) {
    const lines = [];
    let fence = null;
    for (const text of texts) {
        const open = /^ {0,3}(`{3,}|~{3,})/.exec(text);
        let inFence = fence !== null;
        let opens = false;
        let closes = false;
        if (fence === null && open !== null) {
            fence = { char: open[1][0], size: open[1].length };
            inFence = true;
            opens = true;
        }
        else if (fence !== null) {
            const close = /^ {0,3}(`{3,}|~{3,})\s*$/.exec(text);
            if (close !== null &&
                close[1][0] === fence.char &&
                close[1].length >= fence.size) {
                fence = null;
                closes = true;
            }
        }
        lines.push({ text, inFence, opens, closes, tag: "text" });
    }
    const pairs = [];
    const found = (at) => lines[at]?.inFence === true ? null : marker.exec(lines[at].text);
    for (let at = 0; at < lines.length; at++) {
        const m = found(at);
        if (m === null)
            continue;
        let end = -1;
        if (m[2] === "start") {
            for (let to = at + 1; to < lines.length; to++) {
                const n = found(to);
                if (n !== null && n[1] === m[1] && n[2] === "end") {
                    end = to;
                    break;
                }
                if (n !== null && n[1] === m[1] && n[2] === "start")
                    break;
            }
        }
        if (end < 0) {
            lines[at].tag = "orphan";
        }
        else {
            pairs.push({ name: m[1], start: at, end });
            for (let k = at; k <= end; k++)
                lines[k].tag = "pair";
            at = end;
        }
    }
    let quickEnd = null;
    if (findQuick) {
        const at = lines.findIndex((l) => l.tag === "text" && !l.inFence && l.text === quickMarker);
        if (at >= 0) {
            quickEnd = at;
            lines[at].tag = "quick-end";
        }
    }
    const sections = [];
    let open = { level: 0, title: "", heading: null, from: 0, to: 0 };
    for (let at = 0; at < lines.length; at++) {
        const line = lines[at];
        const h = line.tag === "text" && !line.inFence ? heading.exec(line.text) : null;
        if (h === null)
            continue;
        open.to = at;
        sections.push(open);
        open = {
            level: h[1].length,
            title: h[2],
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
function quickRange(a) {
    if (a.quickEnd === null)
        return null;
    let first = -1;
    let last = -1;
    for (let at = a.quickEnd - 1; at >= 0; at--) {
        const line = a.lines[at];
        if (line.tag !== "text" || line.inFence)
            break;
        if (/^\s*-\s/.test(line.text)) {
            if (last < 0)
                last = at;
            first = at;
        }
        else if (line.text.trim() !== "") {
            break;
        }
    }
    return first < 0 ? null : [first, last];
}
/** The units of a section's text: a fenced block as one, every other non-blank line alone. */
function units(a, section) {
    const out = [];
    const text = (at) => a.lines[at];
    for (let at = section.from; at < section.to; at++) {
        const line = text(at);
        if (line.tag !== "text" || line.text.trim() === "")
            continue;
        let end = at;
        if (line.opens) {
            while (end + 1 < section.to && !text(end).closes && text(end + 1).tag === "text")
                end++;
        }
        const texts = [];
        for (let k = at; k <= end; k++)
            texts.push(text(k).text);
        out.push({ lines: texts, key: texts.map((l) => l.trimEnd()).join("\n"), start: at, end });
        at = end;
    }
    return out;
}
const blank = (lines) => lines.every((l) => l.trim() === "");
const trimEdges = (lines) => {
    let from = 0;
    let to = lines.length;
    while (from < to && lines[from].trim() === "")
        from++;
    while (to > from && lines[to - 1].trim() === "")
        to--;
    return lines.slice(from, to);
};
const sectionKey = (s) => `${s.level}|${s.title}`;
const fmText = (blocks) => ["---", ...blocks.flatMap((b) => b.lines), "---"].join("\n");
/** `fresh` with everything Pranshul wrote in `existing` carried over; nothing is dropped. */
function repairText(existing, fresh) {
    const old = (0, frontmatter_js_1.parseFrontmatter)(existing.replace(/\r\n?/g, "\n"));
    const now = (0, frontmatter_js_1.parseFrontmatter)(fresh.replace(/\r\n?/g, "\n"));
    const items = [];
    // Frontmatter: the template's keys with the note's values.
    let head;
    if (!now.present) {
        head = old.present && old.error === null ? fmText(old.blocks) : null;
    }
    else if (old.present && old.error === null) {
        head = (0, frontmatter_js_1.mergeFrontmatter)(old, now);
    }
    else {
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
    const bySection = new Map();
    const overall = new Map();
    const count = (map, key, by) => {
        map.set(key, (map.get(key) ?? 0) + by);
    };
    const seen = new Map();
    const idOf = (s) => {
        const key = sectionKey(s);
        const n = seen.get(key) ?? 0;
        seen.set(key, n + 1);
        return `${key}#${n}`;
    };
    const freshId = new Map();
    for (const s of fresher.sections) {
        const id = idOf(s);
        freshId.set(s, id);
        const own = new Map();
        for (const u of units(fresher, s)) {
            count(own, u.key, 1);
            count(overall, u.key, 1);
        }
        bySection.set(id, own);
    }
    // The note's sections, with the Recovered section of an earlier repair set apart.
    seen.clear();
    let recovered = [];
    const mine = [];
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
        for (let at = quick[0]; at <= quick[1]; at++)
            was.lines[at].tag = "quick";
    }
    // Classify each unit of the note: the template's own, or Pranshul's.
    const custom = new Map();
    const leftovers = [];
    for (const { section, id } of mine) {
        const own = bySection.get(id);
        for (const u of units(was, section)) {
            const left = own?.get(u.key) ?? 0;
            if (left > 0) {
                count(own, u.key, -1);
                count(overall, u.key, -1);
            }
            else {
                leftovers.push({ id, unit: u });
            }
        }
    }
    const authored = [];
    for (const entry of leftovers) {
        if ((overall.get(entry.unit.key) ?? 0) > 0)
            count(overall, entry.unit.key, -1);
        else
            authored.push(entry);
    }
    const lastEnd = new Map();
    for (const { id, unit } of authored) {
        const list = custom.get(id) ?? [];
        const before = lastEnd.get(id);
        list.push({ lines: unit.lines, gap: before !== undefined && unit.start - before > 1 });
        lastEnd.set(id, unit.end);
        custom.set(id, list);
    }
    // Pairs: the note's content goes into the template's pair of the same name and order.
    const used = new Map();
    const freshPairs = new Map();
    for (const p of fresher.pairs)
        freshPairs.set(p.name, [...(freshPairs.get(p.name) ?? []), p]);
    const fills = [];
    for (const p of was.pairs) {
        const content = oldLines.slice(p.start + 1, p.end);
        const n = used.get(p.name) ?? 0;
        used.set(p.name, n + 1);
        const target = freshPairs.get(p.name)?.[n];
        if (target === undefined) {
            if (!blank(content))
                items.push({ label: `discretion:${p.name}`, lines: trimEdges(content) });
        }
        else if (!blank(content)) {
            fills.push({ pair: target, content });
        }
    }
    // Build the new body: fill pairs, then quick lines, from the bottom up so indexes hold.
    const out = [...newLines];
    const edits = fills.map((f) => ({
        at: f.pair.start + 1,
        remove: f.pair.end - f.pair.start - 1,
        add: f.content,
    }));
    if (quick !== null) {
        const lines = oldLines.slice(quick[0], quick[1] + 1);
        if (fresher.quickEnd === null)
            items.push({ label: "roots:quick-notes", lines });
        else
            edits.push({ at: fresher.quickEnd, remove: 0, add: lines });
    }
    const placements = [];
    for (const s of fresher.sections) {
        const list = custom.get(freshId.get(s));
        if (list === undefined)
            continue;
        let to = s.to;
        while (to > s.from && newLines[to - 1].trim() === "")
            to--;
        const block = [];
        if (to > 0 && newLines[to - 1].trim() !== "")
            block.push("");
        list.forEach((u, at) => {
            if (at > 0 && u.gap)
                block.push("");
            block.push(...u.lines);
        });
        if (to === s.to && s.to < newLines.length)
            block.push("");
        placements.push({ at: to, remove: 0, add: block });
    }
    // A section's text goes at its end, after anything filled into its pairs or quick notes.
    const ordered = [...edits, ...placements].sort((a, b) => b.at - a.at);
    for (const e of ordered)
        out.splice(e.at, e.remove, ...e.add);
    // What the template has no place for.
    for (const { section, id } of mine) {
        if (freshId.size > 0 && [...freshId.values()].includes(id))
            continue;
        const list = custom.get(id);
        if (list === undefined)
            continue;
        const lines = list.flatMap((u, at) => (at > 0 && u.gap ? ["", ...u.lines] : u.lines));
        items.push({
            label: section.heading === null ? "Text before the first heading" : section.title,
            lines,
        });
    }
    const tail = [];
    const keep = recovered;
    if (keep.length > 0)
        tail.push(...keep);
    for (const item of items) {
        if (tail.length > 0)
            tail.push("");
        tail.push(`### ${item.label}`, "", ...item.lines);
    }
    let body = out.join("\n");
    if (tail.length > 0)
        body = `${body.replace(/\n*$/, "")}\n\n## ${recoveredTitle}\n\n${tail.join("\n")}`;
    const text = `${head === null ? "" : `${head}\n`}${body}`;
    return `${text.replace(/\n*$/, "")}\n`;
}
    },
  };
  var loaded = {};
  function load(name) {
    if (!loaded[name]) {
      var module = { exports: {} };
      loaded[name] = module;
      definitions[name](module.exports, function (request) {
        var local = /^\.\/([a-z-]+)\.js$/.exec(request);
        return local && definitions[local[1]] ? load(local[1]) : outer(request);
      });
    }
    return loaded[name].exports;
  }
  module.exports = load("launch").createLauncher({"days":"dv.table(\n  [\"Day\", \"Alias\", \"Rating\"],\n  days.map((p) => [p.file.link, p.alias ?? \"\", p.rating ?? \"\"]),\n);\n","habits":"const clock = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));\nconst dueAt = {};\nlet section = null;\nfor (const raw of (await dv.io.load(\"3-Mycelium/config/habits.toml\")).split(\"\\n\")) {\n  const line = raw.trim();\n  const head = /^\\[habits\\.([^\\]]+)\\]$/.exec(line);\n  if (head) section = head[1];\n  else if (line.startsWith(\"[\")) section = null;\n  const set = section ? /^(due|window)\\s*=\\s*(.*)$/.exec(line) : null;\n  const times = set ? set[2].match(/\\d\\d:\\d\\d/g) : null;\n  if (times) dueAt[section] = clock(set[1] === \"due\" ? times[0] : times[times.length - 1]);\n}\nconst lateBy = (id, p) => {\n  const t = (p.habitTimes ?? {})[id];\n  return typeof t === \"string\" && /^\\d\\d:\\d\\d$/.test(t) && dueAt[id] !== undefined\n    ? clock(t) - dueAt[id]\n    : null;\n};\nconst span = (m) => (m < 60 ? `${m} min` : `${Math.round(m / 60)} h`);\nconst median = (xs) => {\n  const sorted = [...xs].sort((a, b) => a - b);\n  const mid = sorted.length >> 1;\n  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;\n};\nconst escape = (text) =>\n  String(text).replace(/&/g, \"&amp;\").replace(/</g, \"&lt;\").replace(/\"/g, \"&quot;\");\nconst hover = (id, p, s) => {\n  if (s === \"delayed\") {\n    const t = (p.habitTimes ?? {})[id];\n    const late = lateBy(id, p);\n    if (!t) return \"delayed\";\n    return late === null ? `done ${t}, late` : `done ${t}, ${span(Math.max(late, 0))} late`;\n  }\n  if (s === \"skipped\") {\n    const reason = (p.skipReasons ?? {})[id];\n    if (reason) return `skipped — ${reason}`;\n  }\n  return s ?? \"not due\";\n};\nconst ids = [...new Set(days.flatMap((p) => Object.keys(p.habits ?? {})))].sort();\nconst known = [\"pending\", \"done\", \"delayed\", \"skipped\", \"missed\"];\nconst past = days.filter((p) => p.date <= today);\nconst openLast = past.length > 0 && +past[past.length - 1].date === +today;\nconst rows = ids.map((id) => {\n  const cells = days.map((p) => {\n    const s = (p.habits ?? {})[id];\n    const state = known.includes(s) ? s : \"future\";\n    return `<span class=\"roots-cell roots-${state}\" title=\"${escape(`${p.date.toFormat(\"ccc d LLL\")}: ${hover(id, p, s)}`)}\"></span>`;\n  });\n  const n = streak(\n    past.map((p) => (p.habits ?? {})[id]),\n    openLast,\n  );\n  const stamped = days.filter((p) => (p.habits ?? {})[id]).length;\n  const done = days.filter((p) => (p.habits ?? {})[id] === \"done\").length;\n  const late = days.filter((p) => (p.habits ?? {})[id] === \"delayed\");\n  const delays = late.map((p) => lateBy(id, p)).filter((m) => m !== null);\n  return [\n    id,\n    cells.join(\"\"),\n    n,\n    `${done + late.length}/${stamped}${late.length ? ` (${done} on time)` : \"\"}`,\n    delays.length ? span(Math.round(median(delays))) : \"\",\n  ];\n});\ndv.table([\"Habit\", \"Days\", \"Streak\", \"Done\", \"Median delay\"], rows);\n","heatmap":"const clock = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));\nconst dueAt = {};\nlet section = null;\nfor (const raw of (await dv.io.load(\"3-Mycelium/config/habits.toml\")).split(\"\\n\")) {\n  const line = raw.trim();\n  const head = /^\\[habits\\.([^\\]]+)\\]$/.exec(line);\n  if (head) section = head[1];\n  else if (line.startsWith(\"[\")) section = null;\n  const set = section ? /^(due|window)\\s*=\\s*(.*)$/.exec(line) : null;\n  const times = set ? set[2].match(/\\d\\d:\\d\\d/g) : null;\n  if (times) dueAt[section] = clock(set[1] === \"due\" ? times[0] : times[times.length - 1]);\n}\nconst lateBy = (id, p) => {\n  const t = (p.habitTimes ?? {})[id];\n  return typeof t === \"string\" && /^\\d\\d:\\d\\d$/.test(t) && dueAt[id] !== undefined\n    ? clock(t) - dueAt[id]\n    : null;\n};\nconst span = (m) => (m < 60 ? `${m} min` : `${Math.round(m / 60)} h`);\nconst median = (xs) => {\n  const sorted = [...xs].sort((a, b) => a - b);\n  const mid = sorted.length >> 1;\n  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;\n};\nconst escape = (text) => String(text).replace(/&/g, \"&amp;\").replace(/</g, \"&lt;\");\nconst hover = (id, p, s) => {\n  if (s === \"delayed\") {\n    const t = (p.habitTimes ?? {})[id];\n    const late = lateBy(id, p);\n    if (!t) return \"delayed\";\n    return late === null ? `done ${t}, late` : `done ${t}, ${span(Math.max(late, 0))} late`;\n  }\n  if (s === \"skipped\") {\n    const reason = (p.skipReasons ?? {})[id];\n    if (reason) return `skipped — ${reason}`;\n  }\n  return s ?? \"not due\";\n};\nconst ids = [...new Set(days.flatMap((p) => Object.keys(p.habits ?? {})))].sort();\nfor (const id of ids) {\n  const stamped = days.filter((p) => (p.habits ?? {})[id]);\n  const done = stamped.filter((p) => p.habits[id] === \"done\").length;\n  const late = stamped.filter((p) => p.habits[id] === \"delayed\");\n  const pct = (n) => (stamped.length ? Math.round((100 * n) / stamped.length) : 0);\n  const delays = late.map((p) => lateBy(id, p)).filter((m) => m !== null);\n  let heading = `${id} — ${pct(done + late.length)}%`;\n  if (late.length) heading += ` (${pct(done)}% on time)`;\n  if (delays.length) heading += `, median delay ${span(Math.round(median(delays)))}`;\n  const byDate = new Map(days.map((p) => [p.date.toFormat(\"yyyy-MM-dd\"), p]));\n  const first = from.minus({ days: from.weekday - 1 });\n  const cells = [];\n  for (let d = first; d <= to; d = d.plus({ days: 1 })) {\n    const col = Math.floor(d.diff(first, \"days\").days / 7);\n    const p = d >= from ? byDate.get(d.toFormat(\"yyyy-MM-dd\")) : undefined;\n    const s = p ? (p.habits ?? {})[id] : undefined;\n    const state = s ?? \"future\";\n    cells.push(\n      `<rect x=\"${col * 14}\" y=\"${(d.weekday - 1) * 14}\" width=\"12\" height=\"12\" rx=\"2\" class=\"roots-${state}\"><title>${escape(`${d.toFormat(\"d LLL\")}: ${hover(id, p, s)}`)}</title></rect>`,\n    );\n  }\n  const weeks = Math.ceil((to.diff(first, \"days\").days + 1) / 7);\n  dv.header(4, heading);\n  dv.el(\n    \"div\",\n    `<svg class=\"roots-chart\" viewBox=\"0 0 ${weeks * 14} 98\" width=\"${Math.min(weeks * 14, 720)}\">${cells.join(\"\")}</svg>`,\n  );\n}\n","home-preamble":"const today = dv.date(\"today\");\nconst range = \"week\";\nconst from = {\n  today: today,\n  week: today.minus({ days: today.weekday - 1 }),\n  \"30 days\": today.minus({ days: 29 }),\n  all: null,\n}[range];\nconst to = range === \"week\" ? from.plus({ days: 6 }) : today;\nconst days = dv\n  .pages('\"1-Roots/Daily\"')\n  .where((p) => p.date && (from === null || p.date >= from) && p.date <= to)\n  .sort((p) => p.date, \"asc\")\n  .array();\n","logs":"const kinds = [\n  [\"Progress\", \"progress\"],\n  [\"Highlights\", \"highlight\"],\n  [\"Ideas\", \"idea\"],\n];\nfor (const [title, tag] of kinds) {\n  dv.header(4, title);\n  const out = [];\n  for (const p of days) {\n    const text = await dv.io.load(p.file.path);\n    const re = new RegExp(`^\\\\s*- #${tag}\\\\b\\\\s*(.*)$`);\n    for (const line of text.split(\"\\n\")) {\n      const m = re.exec(line);\n      if (m && m[1].trim())\n        out.push(`${m[1].replace(/\\s+#captured.*$/, \"\").trim()} — ${p.file.link}`);\n    }\n  }\n  dv.list(out.length ? out : [\"Nothing logged.\"]);\n}\n","notes-below":"const sub = cur.kind === \"quarterly\" ? \"Monthly\" : \"Quarterly\";\nconst notes = dv\n  .pages(`\"1-Roots/${sub}\"`)\n  .where((p) => p.from && dv.date(p.from) >= from && dv.date(p.to) <= to)\n  .sort((p) => p.from, \"asc\")\n  .array();\nfor (const p of notes) {\n  const text = await dv.io.load(p.file.path);\n  const m = /<!-- discretion:summary:start -->([\\s\\S]*?)<!-- discretion:summary:end -->/.exec(text);\n  dv.header(4, p.file.link);\n  dv.paragraph(m && m[1].trim() ? m[1].trim() : \"No summary yet.\");\n}\n","preamble":"const cur = dv.current();\nconst from = dv.date(cur.from);\nconst to = dv.date(cur.to);\nconst today = dv.date(\"today\");\nconst days = dv\n  .pages('\"1-Roots/Daily\"')\n  .where((p) => p.date && p.date >= from && p.date <= to)\n  .sort((p) => p.date, \"asc\")\n  .array();\n","rating-chart":"const ratingChart = (points, mode) => {\n  const H = 100;\n  const pad = 5;\n  const y = (r) => pad + ((10 - r) * (H - 2 * pad)) / 9;\n  const title = (p) => `<title>${p.label}: ${p.rating ?? \"–\"}</title>`;\n  if (mode === \"bars\") {\n    const W = 28;\n    const bars = points.map((p, i) =>\n      p.rating === null\n        ? `<rect x=\"${i * W + 4}\" y=\"${H - 4}\" width=\"${W - 8}\" height=\"4\" class=\"roots-pending\">${title(p)}</rect>`\n        : `<rect x=\"${i * W + 4}\" y=\"${y(p.rating)}\" width=\"${W - 8}\" height=\"${H - y(p.rating)}\" class=\"roots-bar\">${title(p)}</rect>`,\n    );\n    return `<svg class=\"roots-chart\" viewBox=\"0 0 ${Math.max(points.length, 1) * W} ${H}\" width=\"100%\">${bars.join(\"\")}</svg>`;\n  }\n  const width = 360;\n  const x = (i) =>\n    points.length > 1 ? pad + (i * (width - 2 * pad)) / (points.length - 1) : width / 2;\n  const rated = points.flatMap((p, i) =>\n    p.rating === null ? [] : [{ p, x: x(i).toFixed(1), y: y(p.rating).toFixed(1) }],\n  );\n  const line =\n    rated.length > 1\n      ? `<polyline points=\"${rated.map((r) => `${r.x},${r.y}`).join(\" \")}\" class=\"roots-line\"/>`\n      : \"\";\n  const dots = rated.map(\n    (r) => `<circle cx=\"${r.x}\" cy=\"${r.y}\" r=\"3\" class=\"roots-dot\">${title(r.p)}</circle>`,\n  );\n  return `<svg class=\"roots-chart\" viewBox=\"0 0 ${width} ${H}\" width=\"100%\">${line}${dots.join(\"\")}</svg>`;\n};\n","ratings":"const mode = \"bars\";\nconst rated = days.filter((p) => typeof p.rating === \"number\");\nconst average = rated.length ? rated.reduce((s, p) => s + p.rating, 0) / rated.length : null;\ndv.paragraph(\n  average === null\n    ? \"No ratings yet.\"\n    : `Average rating: **${average.toFixed(1)}** over ${rated.length} days`,\n);\ndv.el(\n  \"div\",\n  ratingChart(\n    days.map((p) => ({\n      label: p.date.toFormat(\"ccc d LLL\"),\n      rating: typeof p.rating === \"number\" ? p.rating : null,\n    })),\n    mode,\n  ),\n);\n","streak":"const streak = (states, openLast) => {\n  let n = 0;\n  for (let i = states.length - 1; i >= 0; i--) {\n    const s = states[i];\n    if (s === \"done\" || s === \"delayed\") n++;\n    else if (s === undefined || (s === \"pending\" && openLast && i === states.length - 1)) continue;\n    else break;\n  }\n  return n;\n};\n","streaks":"const ids = [...new Set(days.flatMap((p) => Object.keys(p.habits ?? {})))].sort();\nconst openLast = days.length > 0 && +days[days.length - 1].date === +today;\nif (!ids.length) dv.paragraph(\"No habits stamped yet.\");\nelse\n  dv.table(\n    [\"Habit\", \"Streak\"],\n    ids.map((id) => [\n      id,\n      streak(\n        days.map((p) => (p.habits ?? {})[id]),\n        openLast,\n      ),\n    ]),\n  );\n","today":"const day = `1-Roots/Daily/${today.toFormat(\"yyyy/MM/yyyy-MM-dd\")}`;\nconst week = `1-Roots/Weekly/${today.toFormat(\"kkkk\")}/${today.toFormat(\"kkkk-'W'WW\")}`;\ndv.paragraph(`[[${day}|Today's note]] · [[${week}|This week]]`);\nconst p = days[0];\nif (!p) {\n  dv.paragraph(\"Today's note has not been created yet.\");\n} else {\n  dv.paragraph(`${p.alias || \"No alias yet\"} · rating ${p.rating ?? \"–\"}/10`);\n  const habits = Object.entries(p.habits ?? {}).sort(([a], [b]) => (a < b ? -1 : 1));\n  if (habits.length) dv.table([\"Habit\", \"State\"], habits);\n}\n","wheel-progression":"const areas = [\n  \"health\",\n  \"career\",\n  \"relationships\",\n  \"finance\",\n  \"growth\",\n  \"recreation\",\n  \"social\",\n  \"spirituality\",\n];\nconst periods = [];\nif (cur.kind === \"monthly\") {\n  for (\n    let thursday = from.plus({ days: (11 - from.weekday) % 7 });\n    thursday <= to;\n    thursday = thursday.plus({ days: 7 })\n  )\n    periods.push({ label: thursday.toFormat(\"'W'WW\"), start: thursday, end: thursday });\n} else {\n  const months = cur.kind === \"quarterly\" ? 1 : 3;\n  for (let start = from; start <= to; start = start.plus({ months }))\n    periods.push({\n      label: cur.kind === \"quarterly\" ? start.toFormat(\"LLL\") : start.toFormat(\"'Q'q\"),\n      start,\n      end: start.plus({ months }).minus({ days: 1 }),\n    });\n}\nconst weeks = dv\n  .pages('\"1-Roots/Weekly\"')\n  .where((p) => p.from)\n  .array()\n  .map((p) => ({ wheel: p.wheel ?? {}, thursday: dv.date(p.from).plus({ days: 3 }) }));\nconst cell = (period, area) => {\n  const values = weeks\n    .filter((w) => w.thursday >= period.start && w.thursday <= period.end)\n    .map((w) => w.wheel[area])\n    .filter((v) => typeof v === \"number\");\n  if (!values.length) return \"\";\n  return Math.round((10 * values.reduce((s, v) => s + v, 0)) / values.length) / 10;\n};\ndv.table(\n  [\"Area\", ...periods.map((x) => x.label)],\n  areas.map((a) => [a, ...periods.map((x) => cell(x, a))]),\n);\n"});
})();
