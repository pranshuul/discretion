import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** The launchers that get a hotkey, in this order. */
const hotkeyLaunchers = [
  { name: "repair", key: "R" },
  { name: "today", key: "T" },
] as const;

/** What Roots needs in `.obsidian`, shared by install (which writes it) and status (which checks it). */
export const rootsSettings = {
  templatesFolder: "1-Roots/_roots/templates",
  launchersFolder: "1-Roots/_roots/launchers",
  userScriptsFolder: "1-Roots/_roots/scripts",
  snippet: "roots",
  hotkeyLaunchers,
  /** Templater creates a note in each periodic folder from that kind's launcher. */
  folderTemplates: ["daily", "weekly", "monthly", "quarterly", "yearly"].map((kind) => ({
    folder: `1-Roots/${kind[0]?.toUpperCase()}${kind.slice(1)}`,
    template: `1-Roots/_roots/launchers/${kind}.md`,
  })),
} as const;

/** The path of a launcher, relative to the vault. */
export const launcherPath = (name: string): string => `${rootsSettings.launchersFolder}/${name}.md`;

/** The id Obsidian gives the command that inserts a launcher. */
export const commandId = (launcher: string): string =>
  `templater-obsidian:${launcherPath(launcher)}`;

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

export interface Binding {
  modifiers: string[];
  key: string;
}

/** The modifiers install binds with: Ctrl+Alt, or Cmd+Option on macOS. */
export function modifiersFor(platform: NodeJS.Platform): string[] {
  return platform === "darwin" ? ["Alt", "Meta"] : ["Alt", "Ctrl"];
}

/** How a person reads the binding, `Ctrl+Alt+R` or `Cmd+Option+R`. */
export function describeKey(platform: NodeJS.Platform, key: string): string {
  return platform === "darwin" ? `Cmd+Option+${key}` : `Ctrl+Alt+${key}`;
}

/** A binding's identity: Obsidian's `Mod` is Cmd on macOS and Ctrl elsewhere. */
export function bindingKey(platform: NodeJS.Platform, binding: Binding): string {
  const modifiers = binding.modifiers
    .map((m) => (m === "Mod" ? (platform === "darwin" ? "Meta" : "Ctrl") : m))
    .sort();
  return `${modifiers.join("+")}+${binding.key.toUpperCase()}`;
}

/** Whether `value` is a binding as Obsidian stores them. */
export function isBinding(value: unknown): value is Binding {
  return (
    isRecord(value) &&
    typeof value.key === "string" &&
    Array.isArray(value.modifiers) &&
    value.modifiers.every((m) => typeof m === "string")
  );
}
