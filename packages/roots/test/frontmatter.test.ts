import { describe, expect, it } from "vitest";
import {
  frontmatterFor,
  mergeFrontmatter,
  parseFrontmatter,
  requiredKeys,
} from "../src/frontmatter.js";

describe("frontmatterFor", () => {
  it("writes the roots/1 keys of a daily note, five of them empty", () => {
    expect(frontmatterFor("daily", "2026-11-05")).toBe(
      "---\nroots: 1\ndate: 2026-11-05\nrating:\nalias:\naiRating:\naiAlias:\ndiscretion: 1\nhabits: {}\nhabitTimes: {}\nhabitMinutes: {}\nhabitSource: {}\nskipReasons: {}\n---",
    );
  });

  it("gives each period note its kind and span", () => {
    expect(frontmatterFor("monthly", "2028-02-10")).toBe(
      "---\nroots: 1\nkind: monthly\nfrom: 2028-02-01\nto: 2028-02-29\n---",
    );
    expect(frontmatterFor("home", "2026-11-05")).toBe("---\nroots: 1\nkind: home\n---");
  });

  it("lists the keys each kind must have", () => {
    expect(requiredKeys("home")).toEqual(["roots", "kind"]);
    expect(requiredKeys("yearly")).toEqual(["roots", "kind", "from", "to"]);
    expect(requiredKeys("weekly")).toEqual(["roots", "kind", "from", "to", "wheel"]);
    expect(requiredKeys("daily")).toEqual([
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
    ]);
  });
});

describe("parseFrontmatter", () => {
  it("splits keys with their nested lines, and the body", () => {
    const parsed = parseFrontmatter(
      "---\nroots: 1\nhabits:\n  gym: done\n  meds: done\ntags:\n  - a\n---\n\n# Body\n",
    );
    expect(parsed.present).toBe(true);
    expect(parsed.error).toBeNull();
    expect(parsed.blocks.map((b) => b.key)).toEqual(["roots", "habits", "tags"]);
    expect(parsed.blocks[1]?.lines).toEqual(["habits:", "  gym: done", "  meds: done"]);
    expect(parsed.blocks[2]?.lines).toEqual(["tags:", "  - a"]);
    expect(parsed.body).toBe("\n# Body\n");
  });

  it("accepts quoted keys, comments, flow values and block lists at column zero", () => {
    const parsed = parseFrontmatter(
      '---\n# note\n"odd key": 1\nlist:\n- a\n- b\nmap: {a: 1}\n---\nx\n',
    );
    expect(parsed.error).toBeNull();
    expect(parsed.blocks.map((b) => b.key)).toEqual(["", "odd key", "list", "map"]);
    expect(parsed.blocks[2]?.lines).toEqual(["list:", "- a", "- b"]);
  });

  it("reports text with no fence as absent", () => {
    expect(parseFrontmatter("# Title\n")).toMatchObject({
      present: false,
      blocks: [],
      body: "# Title\n",
      error: null,
    });
  });

  it.each([
    ["an unclosed fence", "---\nroots: 1\n# Title\n", /not closed/],
    ["a tab", "---\nroots: 1\n\tkey: 2\n---\n", /tab/i],
    ["a line that is not a key", "---\nroots: 1\nwhat is this\n---\n", /line 3/],
  ])("reports %s", (_name, text, message) => {
    const parsed = parseFrontmatter(text);
    expect(parsed.present).toBe(true);
    expect(parsed.error).toMatch(message);
  });
});

describe("mergeFrontmatter", () => {
  const merged = (existing: string, fresh: string): string =>
    mergeFrontmatter(parseFrontmatter(existing), parseFrontmatter(fresh));

  it("takes the existing value of every key the template has, in the template's order", () => {
    expect(merged("---\nb: 2\na: 1\n---\n", "---\na:\nb:\nc: 3\n---\n")).toBe(
      "---\na: 1\nb: 2\nc: 3\n---",
    );
  });

  it("keeps keys only the existing note has, after the template's", () => {
    expect(merged("---\nx: 1\na: 1\ny:\n  - 2\n---\n", "---\na:\n---\n")).toBe(
      "---\na: 1\nx: 1\ny:\n  - 2\n---",
    );
  });

  it("merges one level of nested keys: existing values win, missing ones come back", () => {
    expect(
      merged(
        "---\nwheel:\n  growth: 4\n  extra: 9\n---\n",
        "---\nwheel:\n  health:\n  growth:\n---\n",
      ),
    ).toBe("---\nwheel:\n  health:\n  growth: 4\n  extra: 9\n---");
  });

  it("takes the template's nested keys when the existing value is empty", () => {
    expect(
      merged("---\nwheel:\nhabits: {}\n---\n", "---\nwheel:\n  health:\nhabits: {}\n---\n"),
    ).toBe("---\nwheel:\n  health:\nhabits: {}\n---");
  });

  it("keeps an existing value that the template leaves as a flow map", () => {
    expect(merged("---\nhabits:\n  gym: done\n---\n", "---\nhabits: {}\n---\n")).toBe(
      "---\nhabits:\n  gym: done\n---",
    );
  });
});
