import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DiscretionError } from "@discretion/core";
import { templatesDir } from "./templates.js";

/** What Roots needs in `.obsidian`, shared by install (which writes it) and status (which checks it). */
export const rootsSettings = {
  templatesFolder: templatesDir,
  userScriptsFolder: "1-Roots/_roots/scripts",
  snippet: "roots",
  /** Templates that appear in the command palette and get a hotkey, in this order. */
  hotkeyTemplates: [
    { name: "repair", key: "R", purpose: "repair" },
    { name: "today", key: "T", purpose: "open today's note" },
  ],
} as const;

export const commandId = (template: string): string =>
  `templater-obsidian:${templatesDir}/${template}.md`;

/** The parsed JSON file at `path` under `vault`, or `undefined` when it does not exist. */
export function readJson(vault: string, path: string): unknown {
  const file = join(vault, path);
  if (!existsSync(file)) return undefined;
  try {
    return JSON.parse(readFileSync(file, "utf8")) as unknown;
  } catch {
    throw new DiscretionError(
      "D2012",
      `${path} is not valid JSON, so Roots cannot merge its settings into it.`,
      `Fix or delete ${path} (Obsidian recreates it), then run discretion roots install again.`,
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
