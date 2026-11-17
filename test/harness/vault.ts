/** The four vault folders and the subfolders the build plan's Architecture lays out. */
export const vaultFolders: readonly string[] = [];

export interface FixtureVaultOptions {
  /** The vault directory to create. */
  dir: string;
  /** A Time Garden zip file, or a directory holding its files. */
  timeGarden: string;
  /** Extra files, by path relative to the vault root. */
  files?: Record<string, string>;
}

/** Lays the four folders with Time Garden under `1-Roots/`; returns the vault directory. */
export function buildFixtureVault(options: FixtureVaultOptions): string {
  void options;
  throw new Error("red");
}

/** Finds Pranshul's Time Garden copy, if this machine has one. */
export function locateTimeGarden(env?: NodeJS.ProcessEnv): string | undefined {
  void env;
  throw new Error("red");
}
