import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** What Roots needs in `.obsidian`, shared by install (which writes it) and status (which checks it). */
export const rootsSettings = {
  templatesFolder: "1-Roots/_roots/templates",
  userScriptsFolder: "1-Roots/_roots/scripts",
  snippet: "roots",
} as const;

/** The parsed JSON file at `path` under `vault`, or `undefined` when it does not exist. */
export function readJson(vault: string, path: string): unknown {
  const file = join(vault, path);
  if (!existsSync(file)) return undefined;
  try {
    return JSON.parse(readFileSync(file, "utf8")) as unknown;
  } catch {
    throw new Error(
      `${path} is not valid JSON, so Roots cannot merge its settings into it. Fix or delete ${path} (Obsidian recreates it), then run discretion roots install again.`,
    );
  }
}

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
