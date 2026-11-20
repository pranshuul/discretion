import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { formats, renderSchemas } from "../src/schemas.js";
import { PluginsLock } from "../src/pluginslock.js";
import { RootsDaily } from "../src/roots.js";

const fresh = {
  roots: 1,
  date: "2026-11-05",
  rating: null,
  alias: null,
  aiRating: null,
  aiAlias: null,
  discretion: 1,
  habits: {},
  habitTimes: {},
  habitMinutes: {},
  habitSource: {},
  skipReasons: {},
};

describe("roots/1", () => {
  it("accepts the frontmatter of a fresh daily note", () => {
    expect(RootsDaily.safeParse(fresh).success).toBe(true);
  });

  it("accepts a filled-in note, including delayed habits and their done times", () => {
    const note = {
      ...fresh,
      rating: 8,
      alias: "Quiet and productive",
      aiRating: 7,
      aiAlias: "Steady",
      habits: { gym: "skipped", meds: "delayed", read: "done", walk: "missed", sleep: "pending" },
      habitTimes: { meds: "11:05" },
      habitMinutes: { "deep-work": 95 },
      habitSource: { "deep-work": "timed" },
      skipReasons: { gym: "travelling" },
      private: true,
    };
    expect(RootsDaily.safeParse(note).success).toBe(true);
  });

  it("keeps keys Pranshul adds himself", () => {
    const parsed = RootsDaily.parse({ ...fresh, mood: "calm" }) as Record<string, unknown>;
    expect(parsed.mood).toBe("calm");
  });

  it.each([
    ["a roots marker other than 1", { roots: 2 }],
    ["a discretion marker other than 1", { discretion: 2 }],
    ["a date that is not YYYY-MM-DD", { date: "5 Nov 2026" }],
    ["a rating of 0", { rating: 0 }],
    ["a rating of 11", { rating: 11 }],
    ["a fractional rating", { rating: 5.5 }],
    ["a habit state that does not exist", { habits: { gym: "late" } }],
    ["a done time that is not HH:MM", { habitTimes: { meds: "11.05" } }],
    ["a done time past 23:59", { habitTimes: { meds: "24:00" } }],
    ["negative minutes", { habitMinutes: { "deep-work": -1 } }],
    ["a habit source that does not exist", { habitSource: { "deep-work": "guessed" } }],
    ["a skip reason that is not text", { skipReasons: { gym: 3 } }],
  ])("refuses %s", (_name, change) => {
    expect(RootsDaily.safeParse({ ...fresh, ...change }).success).toBe(false);
  });

  it("is a frozen format with a committed schema", () => {
    expect(Object.keys(formats())).toContain("roots/1");
    const rendered = renderSchemas()["roots/1.json"] as string;
    const committed = readFileSync(
      fileURLToPath(new URL("../../../schemas/roots/1.json", import.meta.url)),
      "utf8",
    );
    expect(committed).toBe(rendered);
    expect((JSON.parse(rendered) as { title: string }).title).toBe("roots/1");
  });
});

const sha = "a".repeat(64);
const entry = {
  id: "dataview",
  name: "Dataview",
  repo: "blacksmithgu/obsidian-dataview",
  version: "0.5.68",
  files: { "main.js": sha, "manifest.json": sha, "styles.css": sha },
};
const lock = { schema: "plugins-lock/1", plugins: [entry] };

describe("plugins-lock/1", () => {
  it("accepts a lock of pinned plugins and their file hashes", () => {
    expect(PluginsLock.safeParse(lock).success).toBe(true);
  });

  it.each([
    ["another schema marker", { ...lock, schema: "plugins-lock/2" }],
    [
      "a hash that is not 64 hex digits",
      { ...lock, plugins: [{ ...entry, files: { "main.js": "abc" } }] },
    ],
    [
      "an upper-case hash",
      { ...lock, plugins: [{ ...entry, files: { "main.js": "A".repeat(64) } }] },
    ],
    ["a plugin without a version", { ...lock, plugins: [{ ...entry, version: undefined }] }],
    ["an unknown key", { ...lock, extra: true }],
    ["no files", { ...lock, plugins: [{ ...entry, files: {} }] }],
  ])("refuses %s", (_name, value) => {
    expect(PluginsLock.safeParse(value).success).toBe(false);
  });

  it("is a frozen format with a committed schema", () => {
    expect(Object.keys(formats())).toContain("plugins-lock/1");
    const rendered = renderSchemas()["plugins-lock/1.json"] as string;
    const committed = readFileSync(
      fileURLToPath(new URL("../../../schemas/plugins-lock/1.json", import.meta.url)),
      "utf8",
    );
    expect(committed).toBe(rendered);
  });
});
