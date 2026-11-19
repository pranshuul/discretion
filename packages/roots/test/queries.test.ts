import { describe, expect, it } from "vitest";
import { buttonCode, loadDesign, querySnippet } from "./design-helpers.js";

const design = (): string => loadDesign();

type AsyncFn = (...args: unknown[]) => Promise<unknown>;
const AsyncFunction = Object.getPrototypeOf(async () => undefined).constructor as new (
  ...params: string[]
) => AsyncFn;

/** Runs `code` as the body of an async function with the given named arguments. */
async function run(code: string, args: Record<string, unknown>): Promise<unknown> {
  const fn = new AsyncFunction(...Object.keys(args), code);
  return fn(...Object.values(args));
}

/** A day-precision stand-in for the parts of Luxon's DateTime the queries use. */
class Day {
  private static readonly MS = 86_400_000;
  constructor(private readonly ms: number) {}
  static of(iso: string): Day {
    return new Day(Date.parse(`${iso}T00:00:00Z`));
  }
  private get d(): Date {
    return new Date(this.ms);
  }
  get year(): number {
    return this.d.getUTCFullYear();
  }
  get month(): number {
    return this.d.getUTCMonth() + 1;
  }
  get day(): number {
    return this.d.getUTCDate();
  }
  get quarter(): number {
    return Math.ceil(this.month / 3);
  }
  get weekday(): number {
    return ((this.d.getUTCDay() + 6) % 7) + 1;
  }
  plus(o: { days?: number; months?: number }): Day {
    const d = new Date(this.ms + (o.days ?? 0) * Day.MS);
    if (o.months) d.setUTCMonth(d.getUTCMonth() + o.months);
    return new Day(d.getTime());
  }
  minus(o: { days: number }): Day {
    return new Day(this.ms - o.days * Day.MS);
  }
  diff(o: Day): { days: number } {
    return { days: (this.ms - o.ms) / Day.MS };
  }
  valueOf(): number {
    return this.ms;
  }
  private isoWeek(): { year: number; week: number } {
    const thursday = this.plus({ days: 4 - this.weekday });
    const jan1 = Day.of(`${thursday.year}-01-01`);
    return { year: thursday.year, week: Math.floor(thursday.diff(jan1).days / 7) + 1 };
  }
  toFormat(fmt: string): string {
    const pad = (n: number): string => String(n).padStart(2, "0");
    const names = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    const months = "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split(" ");
    return fmt.replace(/'[^']*'|yyyy|kkkk|MM|dd|WW|ccc|LLL|d|q/g, (t) => {
      switch (t) {
        case "yyyy":
          return String(this.year);
        case "kkkk":
          return String(this.isoWeek().year);
        case "MM":
          return pad(this.month);
        case "dd":
          return pad(this.day);
        case "WW":
          return pad(this.isoWeek().week);
        case "ccc":
          return names[this.weekday - 1] ?? "";
        case "LLL":
          return months[this.month - 1] ?? "";
        case "d":
          return String(this.day);
        case "q":
          return String(this.quarter);
        default:
          return t.slice(1, -1);
      }
    });
  }
}

interface Page {
  file: { path: string; name: string; link: string };
  date?: Day;
  [key: string]: unknown;
}

function daily(iso: string, fm: Record<string, unknown> = {}): Page {
  const [y, m] = iso.split("-");
  const path = `1-Roots/Daily/${y}/${m}/${iso}.md`;
  return { file: { path, name: iso, link: `[[${iso}]]` }, date: Day.of(iso), ...fm };
}

/** A recap note page (weekly, monthly or quarterly) with its range as dates. */
function recap(
  folder: string,
  name: string,
  from: string,
  to: string,
  fm: Record<string, unknown> = {},
): Page {
  const path = `1-Roots/${folder}/${name.slice(0, 4)}/${name}.md`;
  return {
    file: { path, name, link: `[[${name}]]` },
    from: Day.of(from),
    to: Day.of(to),
    ...fm,
  };
}

class Rows<T> {
  constructor(private readonly items: T[]) {}
  where(f: (x: T) => unknown): Rows<T> {
    return new Rows(this.items.filter((x) => Boolean(f(x))));
  }
  sort(key: (x: T) => unknown, dir: "asc" | "desc" = "asc"): Rows<T> {
    const s = dir === "asc" ? 1 : -1;
    return new Rows([...this.items].sort((a, b) => (Number(key(a)) - Number(key(b))) * s));
  }
  array(): T[] {
    return [...this.items];
  }
  get length(): number {
    return this.items.length;
  }
}

interface Out {
  kind: string;
  args: unknown[];
}

/** A Dataview stand-in: pages, dates and the render calls the queries make, recorded in `out`. */
function stubDv(
  pages: Page[],
  current: Record<string, unknown>,
  today: string,
  texts: Record<string, string> = {},
) {
  const out: Out[] = [];
  const rec =
    (kind: string) =>
    (...args: unknown[]): void => {
      out.push({ kind, args });
    };
  const date = (x: unknown): Day | null => {
    if (x instanceof Day) return x;
    if (x === "today") return Day.of(today);
    if (typeof x === "string") return Day.of(x);
    return null;
  };
  const cur: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(current))
    cur[k] = typeof v === "string" && /^\d{4}-/.test(v) ? Day.of(v) : v;
  const dv = {
    current: () => cur,
    date,
    pages: (src: string) => {
      const folder = src.replace(/"/g, "");
      return new Rows(pages.filter((p) => p.file.path.startsWith(`${folder}/`)));
    },
    paragraph: rec("paragraph"),
    el: rec("el"),
    table: rec("table"),
    header: rec("header"),
    list: rec("list"),
    io: {
      load: async (path: string): Promise<string> => texts[path] ?? "",
    },
  };
  return { dv, out };
}

/** Numbers of an SVG: its viewBox size and every plotted point. */
function geometry(svg: string): { w: number; h: number; points: [number, number][]; dots: number } {
  const vb = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(svg);
  expect(vb, "viewBox").not.toBeNull();
  const points: [number, number][] = [];
  const line = /<polyline points="([^"]*)"/.exec(svg);
  if (line?.[1]) {
    for (const pair of line[1].trim().split(/\s+/)) {
      const [x, y] = pair.split(",").map(Number);
      points.push([x ?? NaN, y ?? NaN]);
    }
  }
  let dots = 0;
  for (const m of svg.matchAll(/<circle cx="([\d.]+)" cy="([\d.]+)"/g)) {
    dots++;
    points.push([Number(m[1]), Number(m[2])]);
  }
  return { w: Number(vb?.[1]), h: Number(vb?.[2]), points, dots };
}

type Chart = (points: { label: string; rating: number | null }[], mode: string) => string;
const chart = async (): Promise<Chart> =>
  (await run(`${querySnippet(design(), "Rating chart")}\nreturn ratingChart;`, {})) as Chart;

type Streak = (states: (string | undefined)[], openLast: boolean) => number;
const streakFn = async (): Promise<Streak> =>
  (await run(`${querySnippet(design(), "Streak")}\nreturn streak;`, {})) as Streak;

describe("Roots buttons, run against a stub", () => {
  const note =
    "# Day\n\n## Quick notes\n\n - #idea  old\n<!-- roots:quick-notes:end -->\n\n## Captured\n";

  for (const [label, tag] of [
    ["Progress", "progress"],
    ["Highlight", "highlight"],
    ["Idea", "idea"],
  ] as const) {
    it(`${label} inserts \` - #${tag}  \` directly above the end marker`, async () => {
      let text = note;
      const file = { path: "1-Roots/Daily/2026/11/2026-11-05.md" };
      const app = {
        workspace: { getActiveFile: () => file },
        vault: {
          process: async (f: unknown, fn: (t: string) => string) => {
            expect(f).toBe(file);
            text = fn(text);
            return text;
          },
        },
      };
      await run(buttonCode(design(), label), { app });
      expect(text).toBe(
        note.replace(
          "<!-- roots:quick-notes:end -->",
          ` - #${tag}  \n<!-- roots:quick-notes:end -->`,
        ),
      );
    });
  }

  it("leaves a note without the end marker unchanged", async () => {
    let text = "# Day\n";
    const app = {
      workspace: { getActiveFile: () => ({}) },
      vault: { process: async (_f: unknown, fn: (t: string) => string) => (text = fn(text)) },
    };
    await run(buttonCode(design(), "Progress"), { app });
    expect(text).toBe("# Day\n");
  });

  it("Accept copies aiRating and aiAlias and nothing else", async () => {
    const fm: Record<string, unknown> = {
      rating: null,
      alias: null,
      aiRating: 7,
      aiAlias: "quiet build day",
      date: "x",
    };
    const app = {
      workspace: { getActiveFile: () => ({}) },
      fileManager: {
        processFrontMatter: async (_f: unknown, fn: (fm: Record<string, unknown>) => void) =>
          fn(fm),
      },
    };
    await run(buttonCode(design(), "Accept"), { app });
    expect(fm).toEqual({
      rating: 7,
      alias: "quiet build day",
      aiRating: 7,
      aiAlias: "quiet build day",
      date: "x",
    });

    const empty: Record<string, unknown> = {
      rating: 4,
      alias: "mine",
      aiRating: null,
      aiAlias: "",
    };
    app.fileManager.processFrontMatter = async (_f, fn) => fn(empty);
    await run(buttonCode(design(), "Accept"), { app });
    expect(empty).toEqual({ rating: 4, alias: "mine", aiRating: null, aiAlias: "" });
  });
});

describe("Roots rating chart", () => {
  for (const n of [2, 7, 30, 31, 92, 365, 366]) {
    it(`trend over ${n} days spans the viewBox and stays inside it`, async () => {
      const ratings = Array.from({ length: n }, (_, i) => ({
        label: `d${i}`,
        rating: (i % 10) + 1,
      }));
      const g = geometry((await chart())(ratings, "trend"));
      expect(g.points.length).toBeGreaterThan(0);
      for (const [x, y] of g.points) {
        expect(x).toBeGreaterThanOrEqual(0);
        expect(x).toBeLessThanOrEqual(g.w);
        expect(y).toBeGreaterThanOrEqual(0);
        expect(y).toBeLessThanOrEqual(g.h);
      }
      const xs = g.points.map(([x]) => x);
      expect(Math.min(...xs)).toBeLessThanOrEqual(g.w * 0.05);
      expect(Math.max(...xs)).toBeGreaterThanOrEqual(g.w * 0.95);
    });
  }

  it("draws a dot for a single rated day", async () => {
    const one = geometry((await chart())([{ label: "a", rating: 6 }], "trend"));
    expect(one.dots).toBe(1);
    const sparse = geometry(
      (await chart())(
        [
          { label: "a", rating: null },
          { label: "b", rating: 8 },
          { label: "c", rating: null },
        ],
        "trend",
      ),
    );
    expect(sparse.dots).toBe(1);
    for (const [x, y] of sparse.points) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(sparse.w);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(sparse.h);
    }
  });

  it("puts a higher rating higher on the chart", async () => {
    const g = geometry(
      (await chart())(
        [
          { label: "a", rating: 1 },
          { label: "b", rating: 10 },
        ],
        "trend",
      ),
    );
    const ys = g.points.slice(0, 2).map(([, y]) => y);
    expect(ys[1]).toBeLessThan(ys[0] ?? 0);
  });

  it("bars mode keeps every bar inside the viewBox", async () => {
    const svg = (await chart())(
      Array.from({ length: 7 }, (_, i) => ({ label: `d${i}`, rating: i === 3 ? null : i + 4 })),
      "bars",
    );
    const vb = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(svg);
    const w = Number(vb?.[1]);
    const h = Number(vb?.[2]);
    const rects = [
      ...svg.matchAll(/<rect x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)"/g),
    ];
    expect(rects).toHaveLength(7);
    for (const r of rects) {
      const [x, y, rw, rh] = [r[1], r[2], r[3], r[4]].map(Number) as [
        number,
        number,
        number,
        number,
      ];
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x + rw).toBeLessThanOrEqual(w);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y + rh).toBeLessThanOrEqual(h);
      expect(rh).toBeGreaterThan(0);
    }
  });

  it("the Ratings query draws the month's trend across the whole chart", async () => {
    const pages = Array.from({ length: 30 }, (_, i) =>
      daily(`2026-11-${String(i + 1).padStart(2, "0")}`, { rating: (i % 9) + 1 }),
    );
    const { dv, out } = stubDv(
      pages,
      { kind: "monthly", from: "2026-11-01", to: "2026-11-30" },
      "2026-11-30",
    );
    const d = design();
    const body = querySnippet(d, "Ratings").replace(
      /const mode = "bars";/,
      'const mode = "trend";',
    );
    await run([querySnippet(d, "Preamble"), querySnippet(d, "Rating chart"), body].join("\n\n"), {
      dv,
    });
    const svg = out.find((o) => o.kind === "el")?.args[1];
    expect(typeof svg).toBe("string");
    const g = geometry(svg as string);
    const xs = g.points.map(([x]) => x);
    expect(Math.max(...xs)).toBeLessThanOrEqual(g.w);
    expect(Math.max(...xs)).toBeGreaterThanOrEqual(g.w * 0.95);
    expect(out.find((o) => o.kind === "paragraph")?.args[0]).toContain("over 30 days");
  });
});

describe("Roots streaks", () => {
  it("counts consecutive done days ending at the last day", async () => {
    const streak = await streakFn();
    expect(streak(["done", "done", "done"], false)).toBe(3);
    expect(streak(["done", "missed", "done", "done"], false)).toBe(2);
    expect(streak(["done", "skipped", "done"], false)).toBe(1);
    expect(streak(["missed"], false)).toBe(0);
    expect(streak([], false)).toBe(0);
  });

  it("skips days the habit was not due", async () => {
    const streak = await streakFn();
    expect(streak(["done", undefined, "done", undefined], false)).toBe(2);
  });

  it("does not break on today's pending, but does on an earlier pending", async () => {
    const streak = await streakFn();
    expect(streak(["done", "done", "pending"], true)).toBe(2);
    expect(streak(["done", "done", "pending"], false)).toBe(0);
    expect(streak(["done", "pending", "done"], true)).toBe(1);
    expect(streak(["done", "done", "done"], true)).toBe(3);
  });

  it("the Habits query reports each habit's streak and completion count", async () => {
    const pages = [
      daily("2026-11-02", { habits: { gym: "done", meds: "done" } }),
      daily("2026-11-03", { habits: { gym: "missed", meds: "done" } }),
      daily("2026-11-04", { habits: { gym: "done", meds: "done" } }),
      daily("2026-11-05", { habits: { gym: "pending", meds: "done" } }),
      daily("2026-11-06", { habits: { gym: "pending", meds: "pending" } }),
    ];
    const { dv, out } = stubDv(
      pages,
      { kind: "weekly", from: "2026-11-02", to: "2026-11-08" },
      "2026-11-05",
    );
    const d = design();
    await run(
      [querySnippet(d, "Preamble"), querySnippet(d, "Streak"), querySnippet(d, "Habits")].join(
        "\n\n",
      ),
      {
        dv,
      },
    );
    const table = out.find((o) => o.kind === "table");
    const rows = table?.args[1] as unknown[][];
    expect(rows.map((r) => [r[0], r[2], r[3]])).toEqual([
      ["gym", 1, "2/5"],
      ["meds", 4, "4/5"],
    ]);
  });
});

describe("Roots Home preamble", () => {
  const pages = Array.from({ length: 60 }, (_, i) =>
    daily(Day.of("2026-09-10").plus({ days: i }).toFormat("yyyy-MM-dd")),
  );

  async function range(name: string): Promise<string[]> {
    const { dv } = stubDv(pages, { kind: "home" }, "2026-11-05");
    const code = querySnippet(design(), "Home preamble").replace(
      /const range = "[^"]*";/,
      `const range = "${name}";`,
    );
    const days = (await run(`${code}\nreturn days;`, { dv })) as Page[];
    return days.map((p) => p.file.name);
  }

  it("covers today, the ISO week, the last 30 days and everything up to today", async () => {
    expect(await range("today")).toEqual(["2026-11-05"]);
    expect(await range("week")).toEqual([
      "2026-11-02",
      "2026-11-03",
      "2026-11-04",
      "2026-11-05",
      "2026-11-06",
      "2026-11-07",
      "2026-11-08",
    ]);
    const month = await range("30 days");
    expect(month).toHaveLength(30);
    expect(month[0]).toBe("2026-10-07");
    expect(month.at(-1)).toBe("2026-11-05");
    const all = await range("all");
    expect(all[0]).toBe("2026-09-10");
    expect(all.at(-1)).toBe("2026-11-05");
  });
});

describe("Roots daily plan section", () => {
  it("holds only the plan markers, with no query of its own", () => {
    const d = design();
    const start = d.indexOf("### 6. Today's plan");
    const end = d.indexOf("### 7. Quick notes");
    expect(start).toBeGreaterThan(0);
    const part = d.slice(start, end);
    expect(part).toContain("<!-- discretion:plan:start -->");
    expect(part).toContain("- 10:00–10:45 [[tsk_…|title]] (deep technical, 45/10)");
    expect(part).not.toMatch(/```dataview/);
    expect(part).not.toContain("scheduled");
  });
});

/** The Home preamble with `range` set the way the renderer sets it. */
const homePreamble = (range: string): string =>
  querySnippet(design(), "Home preamble").replace(
    /const range = "[^"]*";/,
    `const range = "${range}";`,
  );

describe("Roots Logs and Days queries", () => {
  const texts: Record<string, string> = {
    "1-Roots/Daily/2026/11/2026-11-03.md": [
      "## Quick notes",
      "",
      " - #progress  ",
      " - #progress shipped the vault layout  ",
      "- #highlight long walk by the lake #captured ^cap-20261103-abc123",
      " - #idea  ",
      "<!-- roots:quick-notes:end -->",
      "",
    ].join("\n"),
    "1-Roots/Daily/2026/11/2026-11-05.md": " - #idea a habit heatmap  \n - #ideas not this one\n",
    "1-Roots/Daily/2026/10/2026-10-31.md": " - #progress outside the week\n",
  };
  const pages = [
    daily("2026-10-31"),
    daily("2026-11-03", { alias: "layout day", rating: 7 }),
    daily("2026-11-05", { rating: 5 }),
  ];
  const week = { kind: "weekly", from: "2026-11-02", to: "2026-11-08" };

  it("gathers Progress, Highlights and Ideas by tag and drops the #captured tail", async () => {
    const { dv, out } = stubDv(pages, week, "2026-11-08", texts);
    const d = design();
    await run([querySnippet(d, "Preamble"), querySnippet(d, "Logs")].join("\n\n"), { dv });
    expect(out.filter((o) => o.kind === "header").map((o) => o.args[1])).toEqual([
      "Progress",
      "Highlights",
      "Ideas",
    ]);
    expect(out.filter((o) => o.kind === "list").map((o) => o.args[0])).toEqual([
      ["shipped the vault layout — [[2026-11-03]]"],
      ["long walk by the lake — [[2026-11-03]]"],
      ["a habit heatmap — [[2026-11-05]]"],
    ]);
  });

  it("says Nothing logged. for an empty tag", async () => {
    const { dv, out } = stubDv([daily("2026-11-04")], week, "2026-11-08", {});
    const d = design();
    await run([querySnippet(d, "Preamble"), querySnippet(d, "Logs")].join("\n\n"), { dv });
    expect(out.filter((o) => o.kind === "list").map((o) => o.args[0])).toEqual([
      ["Nothing logged."],
      ["Nothing logged."],
      ["Nothing logged."],
    ]);
  });

  it("Days lists each day of the range with its alias and rating", async () => {
    const { dv, out } = stubDv(pages, week, "2026-11-08", texts);
    const d = design();
    await run([querySnippet(d, "Preamble"), querySnippet(d, "Days")].join("\n\n"), { dv });
    const table = out.find((o) => o.kind === "table");
    expect(table?.args[0]).toEqual(["Day", "Alias", "Rating"]);
    expect(table?.args[1]).toEqual([
      ["[[2026-11-03]]", "layout day", 7],
      ["[[2026-11-05]]", "", 5],
    ]);
  });
});

describe("Roots Heatmap query", () => {
  it("draws one calendar per habit, Monday first, with the completion percentage", async () => {
    const pages = [
      daily("2026-11-01", { habits: { gym: "missed" } }),
      daily("2026-11-02", { habits: { gym: "done" } }),
      daily("2026-11-03", { habits: { gym: "done", meds: "skipped" } }),
    ];
    const { dv, out } = stubDv(
      pages,
      { kind: "monthly", from: "2026-11-01", to: "2026-11-30" },
      "2026-11-30",
    );
    const d = design();
    await run([querySnippet(d, "Preamble"), querySnippet(d, "Heatmap")].join("\n\n"), { dv });
    expect(out.filter((o) => o.kind === "header").map((o) => o.args[1])).toEqual([
      "gym — 67%",
      "meds — 0%",
    ]);
    const svg = out.find((o) => o.kind === "el")?.args[1] as string;
    const vb = /viewBox="0 0 (\d+) (\d+)"/.exec(svg);
    // 26 October (the Monday before 1 November) to 30 November: 36 days in 6 week columns.
    expect([Number(vb?.[1]), Number(vb?.[2])]).toEqual([6 * 14, 98]);
    const rects = [...svg.matchAll(/<rect x="(\d+)" y="(\d+)"[^>]*class="roots-(\w+)"/g)];
    expect(rects).toHaveLength(36);
    for (const r of rects) {
      expect(Number(r[1])).toBeLessThan(6 * 14);
      expect(Number(r[2])).toBeLessThan(98);
    }
    const at = (x: number, y: number): string | undefined =>
      rects.find((r) => Number(r[1]) === x && Number(r[2]) === y)?.[3];
    expect(at(0, 0)).toBe("future"); // 26 October, before the month
    expect(at(0, 6 * 14)).toBe("missed"); // Sunday 1 November
    expect(at(14, 0)).toBe("done"); // Monday 2 November
    expect(at(14, 14)).toBe("done"); // Tuesday 3 November
    expect(at(14, 28)).toBe("future"); // not stamped
  });
});

describe("Roots Wheel progression query", () => {
  const areas = [
    "health",
    "career",
    "relationships",
    "finance",
    "growth",
    "recreation",
    "social",
    "spirituality",
  ];
  const week = (name: string, monday: string, wheel: Record<string, number>): Page => {
    const sunday = Day.of(monday).plus({ days: 6 }).toFormat("yyyy-MM-dd");
    return recap("Weekly", name, monday, sunday, { kind: "weekly", wheel });
  };
  const weeks = [
    week("2026-W40", "2026-09-28", { health: 2 }), // Thursday 1 October
    week("2026-W44", "2026-10-26", { health: 4, career: 5 }), // Thursday 29 October
    week("2026-W45", "2026-11-02", { health: 6 }),
    week("2026-W46", "2026-11-09", { health: 8, social: 3 }),
    week("2026-W49", "2026-11-30", { health: 5 }), // Thursday 3 December
    week("2026-W53", "2026-12-28", { health: 9 }), // Thursday 31 December
    week("2027-W01", "2027-01-04", { health: 3 }),
  ];

  async function progression(kind: string, from: string, to: string) {
    const { dv, out } = stubDv(weeks, { kind, from, to }, to);
    const d = design();
    await run([querySnippet(d, "Preamble"), querySnippet(d, "Wheel progression")].join("\n\n"), {
      dv,
    });
    const table = out.find((o) => o.kind === "table");
    expect(table, "table").toBeDefined();
    const rows = table?.args[1] as unknown[][];
    expect(rows.map((r) => r[0])).toEqual(areas);
    const row = (a: string): unknown[] => rows.find((r) => r[0] === a)?.slice(1) ?? [];
    return { head: table?.args[0] as string[], row };
  }

  it("a monthly note shows one column per ISO week whose Thursday is in the month", async () => {
    const nov = await progression("monthly", "2026-11-01", "2026-11-30");
    expect(nov.head).toEqual(["Area", "W45", "W46", "W47", "W48"]);
    expect(nov.row("health")).toEqual([6, 8, "", ""]);
    expect(nov.row("social")).toEqual(["", 3, "", ""]);
    expect(nov.row("career")).toEqual(["", "", "", ""]);
  });

  it("a week that straddles two months counts once, in the month holding its Thursday", async () => {
    const oct = await progression("monthly", "2026-10-01", "2026-10-31");
    expect(oct.head).toEqual(["Area", "W40", "W41", "W42", "W43", "W44"]);
    expect(oct.row("health")).toEqual([2, "", "", "", 4]);
    expect(oct.row("career")).toEqual(["", "", "", "", 5]);
    const dec = await progression("monthly", "2026-12-01", "2026-12-31");
    expect(dec.head).toEqual(["Area", "W49", "W50", "W51", "W52", "W53"]);
    expect(dec.row("health")).toEqual([5, "", "", "", 9]);
  });

  it("a quarterly note averages the weekly values per month", async () => {
    const q4 = await progression("quarterly", "2026-10-01", "2026-12-31");
    expect(q4.head).toEqual(["Area", "Oct", "Nov", "Dec"]);
    expect(q4.row("health")).toEqual([3, 7, 7]);
    expect(q4.row("career")).toEqual([5, "", ""]);
    expect(q4.row("finance")).toEqual(["", "", ""]);
  });

  it("a yearly note averages the weekly values per quarter, week 53 staying in its own year", async () => {
    const y2026 = await progression("yearly", "2026-01-01", "2026-12-31");
    expect(y2026.head).toEqual(["Area", "Q1", "Q2", "Q3", "Q4"]);
    expect(y2026.row("health")).toEqual(["", "", "", 5.7]);
    const y2027 = await progression("yearly", "2027-01-01", "2027-12-31");
    expect(y2027.row("health")).toEqual([3, "", "", ""]);
  });
});

describe("Roots Notes below query", () => {
  it("quotes each lower note's Summary in date order", async () => {
    const months = [
      recap("Monthly", "2026-09", "2026-09-01", "2026-09-30"),
      recap("Monthly", "2026-11", "2026-11-01", "2026-11-30"),
      recap("Monthly", "2026-10", "2026-10-01", "2026-10-31"),
      recap("Monthly", "2026-12", "2026-12-01", "2026-12-31"),
    ];
    const summary = (t: string): string =>
      `# x\n\n<!-- discretion:summary:start -->\n${t}\n<!-- discretion:summary:end -->\n`;
    const texts = {
      "1-Roots/Monthly/2026/2026-09.md": summary("Outside the quarter."),
      "1-Roots/Monthly/2026/2026-10.md": summary("A steady month."),
      "1-Roots/Monthly/2026/2026-11.md": summary(""),
      "1-Roots/Monthly/2026/2026-12.md": "# no markers\n",
    };
    const { dv, out } = stubDv(
      months,
      { kind: "quarterly", from: "2026-10-01", to: "2026-12-31" },
      "2026-12-31",
      texts,
    );
    const d = design();
    await run([querySnippet(d, "Preamble"), querySnippet(d, "Notes below")].join("\n\n"), { dv });
    expect(out.map((o) => [o.kind, o.args.at(-1)])).toEqual([
      ["header", "[[2026-10]]"],
      ["paragraph", "A steady month."],
      ["header", "[[2026-11]]"],
      ["paragraph", "No summary yet."],
      ["header", "[[2026-12]]"],
      ["paragraph", "No summary yet."],
    ]);
  });
});

describe("Roots Home Today and Streaks", () => {
  it("links today's note and its ISO week, using week 53 for 1 January 2027", async () => {
    const pages = [
      daily("2026-12-31", { alias: "yesterday" }),
      daily("2027-01-01", {
        alias: "new year",
        rating: 7,
        habits: { meds: "done", gym: "pending" },
      }),
    ];
    const { dv, out } = stubDv(pages, { kind: "home" }, "2027-01-01");
    await run([homePreamble("today"), querySnippet(design(), "Today")].join("\n\n"), { dv });
    expect(out.map((o) => [o.kind, o.args])).toEqual([
      [
        "paragraph",
        [
          "[[1-Roots/Daily/2027/01/2027-01-01|Today's note]] · [[1-Roots/Weekly/2026/2026-W53|This week]]",
        ],
      ],
      ["paragraph", ["new year · rating 7/10"]],
      [
        "table",
        [
          ["Habit", "State"],
          [
            ["gym", "pending"],
            ["meds", "done"],
          ],
        ],
      ],
    ]);
  });

  it("says so when today's note does not exist yet", async () => {
    const { dv, out } = stubDv([daily("2026-11-04")], { kind: "home" }, "2026-11-05");
    await run([homePreamble("today"), querySnippet(design(), "Today")].join("\n\n"), { dv });
    expect(out.map((o) => o.args[0])).toEqual([
      "[[1-Roots/Daily/2026/11/2026-11-05|Today's note]] · [[1-Roots/Weekly/2026/2026-W45|This week]]",
      "Today's note has not been created yet.",
    ]);
  });

  it("Streaks gives each habit's current streak ending today", async () => {
    const pages = [
      daily("2026-11-01", { habits: { meds: "done" } }),
      daily("2026-11-02", { habits: { meds: "missed", gym: "done" } }),
      daily("2026-11-03", { habits: { meds: "done", gym: "done" } }),
      daily("2026-11-04", { habits: { meds: "done", gym: "done" } }),
      daily("2026-11-05", { habits: { meds: "done", gym: "pending" } }),
      daily("2026-11-06", { habits: { meds: "pending", gym: "pending" } }),
    ];
    const { dv, out } = stubDv(pages, { kind: "home" }, "2026-11-05");
    const d = design();
    await run(
      [homePreamble("all"), querySnippet(d, "Streak"), querySnippet(d, "Streaks")].join("\n\n"),
      { dv },
    );
    const table = out.find((o) => o.kind === "table");
    expect(table?.args).toEqual([
      ["Habit", "Streak"],
      [
        ["gym", 3],
        ["meds", 3],
      ],
    ]);
  });

  it("Streaks says so when nothing is stamped", async () => {
    const { dv, out } = stubDv([daily("2026-11-05")], { kind: "home" }, "2026-11-05");
    const d = design();
    await run(
      [homePreamble("all"), querySnippet(d, "Streak"), querySnippet(d, "Streaks")].join("\n\n"),
      { dv },
    );
    expect(out).toEqual([{ kind: "paragraph", args: ["No habits stamped yet."] }]);
  });
});
