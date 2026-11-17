import { spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";

/** The four vault folders and the subfolders the build plan's Architecture lays out. */
export const vaultFolders: readonly string[] = [
  "1-Roots",
  "2-Orchard",
  "3-Mycelium",
  "3-Mycelium/canon",
  "3-Mycelium/inbox",
  "3-Mycelium/goals",
  "3-Mycelium/tasks",
  "3-Mycelium/plans",
  "3-Mycelium/review",
  "3-Mycelium/review/items",
  "3-Mycelium/reels",
  "3-Mycelium/days",
  "3-Mycelium/ribbons",
  "3-Mycelium/config",
  "4-Nursery",
  "4-Nursery/cards",
  "4-Nursery/concepts",
];

export interface FixtureVaultOptions {
  /** The vault directory to create. */
  dir: string;
  /** A Time Garden zip file, or a directory holding its files. */
  timeGarden: string;
  /** Extra files, by path relative to the vault root. */
  files?: Record<string, string>;
}

const junk = new Set([".DS_Store", "__MACOSX"]);

function copyTree(from: string, to: string): void {
  cpSync(from, to, {
    recursive: true,
    filter: (source) => !junk.has(source.split("/").pop() ?? ""),
  });
}

function unzipInto(zip: string, dir: string): void {
  const result = spawnSync("unzip", ["-q", "-o", zip, "-x", "__MACOSX/*", "-d", dir], {
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(
      `Could not unzip the Time Garden archive ${zip}: ${result.stderr || result.error}`,
    );
  }
}

/** Lays the four folders with Time Garden under `1-Roots/`; returns the vault directory. */
export function buildFixtureVault(options: FixtureVaultOptions): string {
  const { dir, timeGarden, files = {} } = options;
  if (!existsSync(timeGarden)) {
    throw new Error(`The Time Garden source ${timeGarden} does not exist.`);
  }
  if (existsSync(dir) && readdirSync(dir).length > 0) {
    throw new Error(`The vault directory ${dir} is not empty.`);
  }
  const root = resolve(dir);
  const targets = Object.keys(files).map((name) => {
    const target = resolve(root, name);
    const rel = relative(root, target);
    if (isAbsolute(name) || rel.startsWith("..") || isAbsolute(rel)) {
      throw new Error(`The file ${name} lies outside the vault.`);
    }
    return target;
  });

  mkdirSync(dir, { recursive: true });
  for (const folder of vaultFolders) {
    mkdirSync(join(dir, folder), { recursive: true });
  }
  const roots = join(dir, "1-Roots");
  if (statSync(timeGarden).isDirectory()) {
    copyTree(timeGarden, roots);
  } else {
    const scratch = mkdtempSync(join(tmpdir(), "discretion-timegarden-"));
    try {
      unzipInto(timeGarden, scratch);
      const top = readdirSync(scratch).filter((name) => !junk.has(name));
      const only = top.length === 1 ? join(scratch, top[0] as string) : undefined;
      copyTree(only !== undefined && statSync(only).isDirectory() ? only : scratch, roots);
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  }
  Object.values(files).forEach((content, i) => {
    const target = targets[i] as string;
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, content);
  });
  return dir;
}

/** Finds Pranshul's Time Garden copy, if this machine has one. */
export function locateTimeGarden(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const candidates = [
    env.TIME_GARDEN_DIR,
    env.HOME === undefined ? undefined : join(env.HOME, "inbox", "time-garden"),
    "/inputs/time-garden",
  ];
  for (const candidate of candidates) {
    if (candidate === undefined || !existsSync(candidate) || !statSync(candidate).isDirectory()) {
      continue;
    }
    const zip = readdirSync(candidate)
      .filter((name) => name.endsWith(".zip"))
      .sort()[0];
    return zip === undefined ? candidate : join(candidate, zip);
  }
  return undefined;
}
