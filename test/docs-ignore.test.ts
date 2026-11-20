import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = fileURLToPath(new URL("../", import.meta.url));

describe("plan exports under docs/", () => {
  it("are not linted: Prettier ignores docs/", () => {
    const lines = readFileSync(`${root}.prettierignore`, "utf8").split("\n");
    expect(lines).toContain("docs/");
  });
});
