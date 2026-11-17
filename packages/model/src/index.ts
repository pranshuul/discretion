/** One frozen format: a validator for values read from a file or a message. */
export interface Format {
  safeParse(input: unknown): { success: boolean };
}

function red(): never {
  throw new Error("red");
}

/** `config/1`: `discretion.toml`. */
export const Config: Format = { safeParse: red };

/** `event/1`: one line of the event log. */
export const Event: Format = { safeParse: red };

/** `action/1`: one line of the action log. */
export const Action: Format = { safeParse: red };

/** `log/1`: one line of a raw log file. */
export const Log: Format = { safeParse: red };

/** `runflow/1`: `workflows/<name>.toml`. */
export const Runflow: Format = { safeParse: red };

/** Every frozen format by its versioned name. */
export function formats(): Record<string, Format> {
  throw new Error("red");
}

/** The JSON Schema text of every format, keyed by its path under `schemas/`. */
export function renderSchemas(): Record<string, string> {
  throw new Error("red");
}

/** Paths under `dir` that differ from the generated schemas. */
export function checkSchemas(dir: string): string[] {
  void dir;
  throw new Error("red");
}

/** Writes the generated schemas into `dir`, or with `--check` reports drift; returns the exit code. */
export function runSchemas(args: string[], dir: string, out: (line: string) => void): number {
  void args;
  void dir;
  void out;
  throw new Error("red");
}
