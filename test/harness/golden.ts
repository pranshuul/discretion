import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export interface GoldenOptions {
  /** Rewrite the golden file instead of comparing. Defaults to `UPDATE_GOLDEN=1`. */
  update?: boolean;
}

function firstDifference(expected: Buffer, actual: Buffer): string {
  const want = expected.toString("utf8").split("\n");
  const got = actual.toString("utf8").split("\n");
  for (let i = 0; i < Math.max(want.length, got.length); i++) {
    if (want[i] !== got[i]) {
      return `first difference at line ${i + 1}: golden ${JSON.stringify(want[i] ?? "<end>")}, actual ${JSON.stringify(got[i] ?? "<end>")}`;
    }
  }
  return `the files have the same lines but differ in length (${expected.length} against ${actual.length} bytes)`;
}

/** Compares output with a committed golden file byte for byte. */
export function expectGolden(
  actual: string | Uint8Array,
  path: string,
  options: GoldenOptions = {},
): void {
  const bytes = typeof actual === "string" ? Buffer.from(actual, "utf8") : Buffer.from(actual);
  const update = options.update ?? process.env.UPDATE_GOLDEN === "1";
  if (update) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, bytes);
    return;
  }
  if (!existsSync(path)) {
    throw new Error(`Golden file ${path} does not exist. Run with UPDATE_GOLDEN=1 to create it.`);
  }
  const expected = readFileSync(path);
  if (!expected.equals(bytes)) {
    throw new Error(
      `Output differs from golden file ${path}: ${firstDifference(expected, bytes)}. Run with UPDATE_GOLDEN=1 to accept it.`,
    );
  }
}
