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

/** The folders the builder lays: Time Garden goes under `1-Roots/`. */
export const vaultFolders: readonly string[] = ["1-Roots"];

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

/** Lays Time Garden under `1-Roots/`; returns the vault directory. */
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

/** Finds Pranshul's Time Garden copy in `~/inbox/time-garden` or `/inputs/time-garden`, if present. */
export function locateTimeGarden(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const candidates = [
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
