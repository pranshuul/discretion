export interface GoldenOptions {
  /** Rewrite the golden file instead of comparing. Defaults to `UPDATE_GOLDEN=1`. */
  update?: boolean;
}

/** Compares output with a committed golden file byte for byte. */
export function expectGolden(
  actual: string | Uint8Array,
  path: string,
  options: GoldenOptions = {},
): void {
  void actual;
  void path;
  void options;
  throw new Error("red");
}
