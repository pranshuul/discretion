function red(): never {
  throw new Error("red");
}

/** A plugin release pinned by version, with the SHA-256 of each file Obsidian loads. */
export interface PinnedPlugin {
  id: string;
  name: string;
  repo: string;
  version: string;
  files: Readonly<Record<string, string>>;
}

export const pinnedPlugins: readonly PinnedPlugin[] = red();

/** The download URL of `file` in `plugin`'s pinned GitHub release, under `base`. */
export function releaseUrl(base: string, plugin: PinnedPlugin, file: string): string {
  return red() && `${base}${plugin.repo}${file}`;
}
