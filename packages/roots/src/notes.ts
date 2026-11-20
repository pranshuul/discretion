import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { shippedSnippets } from "./assets.js";
import { dateFromName, notePath } from "./dates.js";
import { unifiedDiff } from "./diff.js";
import { RootsError } from "./errors.js";
import { noteKinds, type NoteKind } from "./kinds.js";
import { renderNote, type Reader } from "./render.js";
import { identifyNote, repairText } from "./repair.js";

/** Reads a vault-relative file as text, or null when it does not exist. */
function fileReader(vault: string): Reader {
  return (path) => {
    const file = join(vault, path);
    return Promise.resolve(existsSync(file) ? readFileSync(file, "utf8") : null);
  };
}

export interface NewNoteOptions {
  vault: string;
  kind: NoteKind;
  date: string;
  dryRun?: boolean;
}

export interface NewNoteResult {
  path: string;
  created: boolean;
}

/** Writes the note unless it exists; an existing note is never rendered again. */
export async function newNote(options: NewNoteOptions): Promise<NewNoteResult> {
  const path = notePath(options.kind, options.date);
  const file = join(options.vault, path);
  if (existsSync(file)) return { path, created: false };
  const text = await renderNote(
    options.kind,
    options.date,
    fileReader(options.vault),
    shippedSnippets(),
  );
  if (options.dryRun !== true) {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, text);
  }
  return { path, created: true };
}

export interface RepairOptions {
  vault: string;
  /** A note path, or a date: `YYYY-MM-DD`, `YYYY-Www`, `YYYY-MM`, `YYYY-Qn` or `YYYY`. */
  target: string;
  dryRun?: boolean;
}

export interface RepairResult {
  path: string;
  changed: boolean;
  diff: string;
}

const refuse = (message: string): RootsError =>
  new RootsError(
    "D2013",
    message,
    "Name a Roots note by its path, or by its date as YYYY-MM-DD, YYYY-Www, YYYY-MM, YYYY-Qn or YYYY.",
  );

/** The vault-relative path of the note `target` names. */
function resolveTarget(vault: string, target: string): string {
  for (const kind of noteKinds) {
    const date = kind === "home" ? null : dateFromName(kind, target);
    if (date !== null) return notePath(kind, date);
  }
  const candidates = isAbsolute(target)
    ? [target]
    : [join(vault, target), join(vault, "1-Roots", target), resolve(target)];
  for (const candidate of candidates) {
    const path = relative(vault, candidate).split("\\").join("/");
    if (!path.startsWith("..") && !isAbsolute(path) && existsSync(candidate)) return path;
  }
  throw refuse(`There is no note ${JSON.stringify(target)} in the vault.`);
}

const git = (vault: string, ...args: string[]): string =>
  execFileSync("git", ["-C", vault, ...args], { encoding: "utf8" });

/** Commits `paths`, with an identity of Discretion's own when git has none configured. */
function commit(vault: string, message: string, ...paths: string[]): void {
  git(vault, "add", "-A", "--", ...(paths.length === 0 ? ["."] : paths));
  let identity: string[] = [];
  try {
    if (git(vault, "config", "user.email").trim() === "") throw new Error("unset");
  } catch {
    identity = ["-c", "user.name=Discretion", "-c", "user.email=discretion@localhost"];
  }
  git(vault, ...identity, "-c", "commit.gpgsign=false", "commit", "-q", "-m", message);
}

/** Repairs one note from the current template; commits the vault before and after. */
export async function repairNote(options: RepairOptions): Promise<RepairResult> {
  const vault = resolve(options.vault);
  const path = resolveTarget(vault, options.target);
  if (!existsSync(join(vault, path))) throw refuse(`There is no note ${path} in the vault.`);
  const existing = readFileSync(join(vault, path), "utf8");
  const found = identifyNote(path, existing);
  if (found === null)
    throw refuse(`${path} is not a Roots note: its name and frontmatter name no kind.`);
  const fresh = await renderNote(found.kind, found.date, fileReader(vault), shippedSnippets());
  const repaired = repairText(existing, fresh);
  if (repaired === existing) return { path, changed: false, diff: "" };
  const diff = unifiedDiff(existing, repaired, path, `${path} (repaired)`);
  if (options.dryRun === true) return { path, changed: true, diff };
  if (!existsSync(join(vault, ".git"))) {
    throw new RootsError(
      "D2012",
      `${vault} is not a git repository, so the repair could not be committed and undone.`,
      "Run ops/d1.sh to create the vault repository, then repair again; or use --dry-run to see the changes.",
    );
  }
  if (git(vault, "status", "--porcelain").trim() !== "") {
    commit(vault, `discretion: roots repair ${path} (before)`);
  }
  writeFileSync(join(vault, path), repaired);
  commit(vault, `discretion: roots repair ${path}`, path);
  return { path, changed: true, diff };
}
