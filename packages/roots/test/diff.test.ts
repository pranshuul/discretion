import { describe, expect, it } from "vitest";
import { unifiedDiff } from "../src/diff.js";

describe("unifiedDiff", () => {
  it("is empty for equal texts", () => {
    expect(unifiedDiff("a\nb\n", "a\nb\n", "x", "y")).toBe("");
  });

  it("shows changed lines with labels and a hunk header", () => {
    expect(unifiedDiff("a\nb\nc\n", "a\nB\nc\n", "before", "after")).toBe(
      "--- before\n+++ after\n@@ -1,3 +1,3 @@\n a\n-b\n+B\n c\n",
    );
  });

  it("shows added and removed lines, with three lines of context", () => {
    const before = ["1", "2", "3", "4", "5", "6", "7", "8", "9"].join("\n") + "\n";
    const after = ["1", "2", "3", "4", "5", "new", "6", "7", "8", "9"].join("\n") + "\n";
    expect(unifiedDiff(before, after, "a", "b")).toBe(
      "--- a\n+++ b\n@@ -3,6 +3,7 @@\n 3\n 4\n 5\n+new\n 6\n 7\n 8\n",
    );
  });

  it("splits distant changes into separate hunks", () => {
    const lines = Array.from({ length: 30 }, (_, i) => `l${i}`);
    const after = [...lines];
    after[1] = "X";
    after[28] = "Y";
    const diff = unifiedDiff(`${lines.join("\n")}\n`, `${after.join("\n")}\n`, "a", "b");
    expect(diff.match(/^@@/gm)).toHaveLength(2);
  });
});
