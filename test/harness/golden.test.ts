import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { expectGolden } from "./golden.js";
import { scratch } from "./support.js";

function golden(content: string | Uint8Array): string {
  const path = join(scratch(), "g.md");
  writeFileSync(path, content);
  return path;
}

describe("expectGolden", () => {
  const saved = process.env.UPDATE_GOLDEN;
  afterEach(() => {
    if (saved === undefined) {
      delete process.env.UPDATE_GOLDEN;
    } else {
      process.env.UPDATE_GOLDEN = saved;
    }
  });

  it("passes on identical text", () => {
    expect(() => expectGolden("a\nb\n", golden("a\nb\n"), { update: false })).not.toThrow();
  });

  it("passes on identical bytes", () => {
    const bytes = new Uint8Array([0, 1, 2, 255]);
    expect(() => expectGolden(bytes, golden(bytes), { update: false })).not.toThrow();
  });

  it("compares text as UTF-8", () => {
    expect(() =>
      expectGolden("café\n", golden(Buffer.from("café\n")), { update: false }),
    ).not.toThrow();
  });

  it("fails on a one-byte difference and names the path and the first differing line", () => {
    const path = golden("one\ntwo\nthree\n");
    expect(() => expectGolden("one\ntwx\nthree\n", path, { update: false })).toThrow(
      new RegExp(`${path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[\\s\\S]*line 2`),
    );
  });

  it("fails on a missing trailing newline", () => {
    expect(() => expectGolden("a", golden("a\n"), { update: false })).toThrow();
  });

  it("fails on CRLF against LF", () => {
    expect(() => expectGolden("a\r\nb\n", golden("a\nb\n"), { update: false })).toThrow();
  });

  it("fails when the golden file is missing and says how to create it", () => {
    const path = join(scratch(), "missing.md");
    expect(() => expectGolden("x", path, { update: false })).toThrow(/UPDATE_GOLDEN=1/);
    expect(existsSync(path)).toBe(false);
  });

  it("writes the golden file when updating, creating folders", () => {
    const path = join(scratch(), "deep", "er", "g.md");
    expectGolden("fresh\n", path, { update: true });
    expect(readFileSync(path, "utf8")).toBe("fresh\n");
    expect(() => expectGolden("fresh\n", path, { update: false })).not.toThrow();
  });

  it("overwrites a stale golden file when updating", () => {
    const path = golden("old\n");
    expectGolden("new\n", path, { update: true });
    expect(readFileSync(path, "utf8")).toBe("new\n");
  });

  it("updates when UPDATE_GOLDEN=1 and no option is given", () => {
    const path = golden("old\n");
    process.env.UPDATE_GOLDEN = "1";
    expectGolden("new\n", path);
    expect(readFileSync(path, "utf8")).toBe("new\n");
  });

  it("compares when UPDATE_GOLDEN is unset and no option is given", () => {
    const path = golden("old\n");
    delete process.env.UPDATE_GOLDEN;
    expect(() => expectGolden("new\n", path)).toThrow();
    expect(readFileSync(path, "utf8")).toBe("old\n");
  });
});
