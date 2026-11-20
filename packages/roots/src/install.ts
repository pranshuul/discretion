import type { PinnedPlugin } from "./pins.js";

function red(): never {
  throw new Error("red");
}

export interface InstallOptions {
  vault: string;
  dryRun?: boolean;
  /** Replaces `fetch` for the plugin downloads. */
  fetch?: typeof fetch;
  /** Where releases are downloaded from; GitHub by default. */
  githubBase?: string;
  /** Replaces the pinned plugin list. */
  plugins?: readonly PinnedPlugin[];
  /** Picks the hotkey modifiers; the running platform by default. */
  platform?: NodeJS.Platform;
}

export interface InstallResult {
  /** What was done, or with `dryRun` what would be. Empty when everything is in place. */
  changes: string[];
  /** Things to tell the user, such as a hotkey that was already taken. */
  notices: string[];
}

/** Lays out Roots in the vault and installs the pinned plugins. */
export async function install(options: InstallOptions): Promise<InstallResult> {
  return red() && { changes: [options.vault], notices: [] };
}
