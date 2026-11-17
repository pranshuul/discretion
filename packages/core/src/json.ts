function sorted(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sorted);
  }
  if (value !== null && typeof value === "object") {
    const object = value as Record<string, unknown>;
    if (typeof (object as { toJSON?: unknown }).toJSON === "function") {
      return sorted((object as { toJSON(): unknown }).toJSON());
    }
    return Object.fromEntries(
      Object.keys(object)
        .sort()
        .map((key) => [key, sorted(object[key])]),
    );
  }
  return value;
}

/** JSON with every object's keys sorted, so output is deterministic. */
export function stableStringify(value: unknown): string {
  return JSON.stringify(sorted(value));
}
