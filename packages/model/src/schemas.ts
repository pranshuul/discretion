import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import type { ZodTypeAny } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { Action } from "./action.js";
import { Config } from "./config.js";
import { Event } from "./event.js";
import { Log } from "./log.js";
import { Runflow } from "./runflow.js";

/** Every frozen format by its versioned name. */
export function formats(): Record<string, ZodTypeAny> {
  return {
    "action/1": Action,
    "config/1": Config,
    "event/1": Event,
    "log/1": Log,
    "runflow/1": Runflow,
  };
}

type Json = { [key: string]: Json } | Json[] | string | number | boolean | null;

function sortKeys(value: Json): Json {
  if (Array.isArray(value)) {
    return value.map(sortKeys);
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, sortKeys(value[key] as Json)]),
    );
  }
  return value;
}

/** The JSON Schema text of every format, keyed by its path under `schemas/`. */
export function renderSchemas(): Record<string, string> {
  const rendered: Record<string, string> = {};
  for (const [name, format] of Object.entries(formats()).sort(([a], [b]) => a.localeCompare(b))) {
    const schema = zodToJsonSchema(format, { target: "jsonSchema7", $refStrategy: "none" });
    const titled = { ...schema, title: name } as Json;
    rendered[`${name}.json`] = `${JSON.stringify(sortKeys(titled), null, 2)}\n`;
  }
  return rendered;
}

/** Every `.json` file under `dir`, as `/`-separated paths relative to it. */
function jsonFiles(dir: string, at: string = dir): string[] {
  if (!existsSync(at)) {
    return [];
  }
  return readdirSync(at, { withFileTypes: true }).flatMap((entry) => {
    const path = join(at, entry.name);
    if (entry.isDirectory()) {
      return jsonFiles(dir, path);
    }
    return entry.name.endsWith(".json") ? [relative(dir, path).split(sep).join("/")] : [];
  });
}

/** Paths under `dir` that differ from the generated schemas: changed, missing or not generated. */
export function checkSchemas(dir: string): string[] {
  const expected = renderSchemas();
  const drift = new Set<string>();
  for (const [path, text] of Object.entries(expected)) {
    const file = join(dir, path);
    if (!existsSync(file) || readFileSync(file, "utf8") !== text) {
      drift.add(path);
    }
  }
  for (const path of jsonFiles(dir)) {
    if (!(path in expected)) {
      drift.add(path);
    }
  }
  return [...drift].sort();
}

/** Removes `path`'s parent directories up to `dir` while they are empty. */
function pruneEmpty(dir: string, path: string): void {
  for (let at = dirname(path); at !== dir && at.startsWith(dir); at = dirname(at)) {
    if (readdirSync(at).length > 0) {
      return;
    }
    rmSync(at, { recursive: true });
  }
}

const usage = "usage: schemas [--check]";

/** Writes the generated schemas into `dir`, or with `--check` reports drift; returns the exit code. */
export function runSchemas(args: string[], dir: string, out: (line: string) => void): number {
  if (args.length > 1 || (args.length === 1 && args[0] !== "--check")) {
    out(usage);
    return 2;
  }
  if (args[0] === "--check") {
    const drift = checkSchemas(dir);
    if (drift.length === 0) {
      out("schemas are up to date");
      return 0;
    }
    for (const path of drift) {
      out(`schema out of date: ${path}`);
    }
    out("run `pnpm --filter @discretion/model schemas` and commit the result");
    return 1;
  }
  const expected = renderSchemas();
  for (const path of jsonFiles(dir)) {
    if (!(path in expected)) {
      const file = join(dir, path);
      rmSync(file);
      pruneEmpty(dir, file);
    }
  }
  for (const [path, text] of Object.entries(expected)) {
    const file = join(dir, path);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, text);
  }
  return 0;
}
