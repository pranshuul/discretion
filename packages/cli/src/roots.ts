import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { DiscretionError, readConfig, stableStringify, systemClock, today } from "@discretion/core";
import {
  launcherNames,
  noteKinds,
  templateNames,
  type NoteKind,
  type TemplateName,
} from "@discretion/roots/assets";
import { periodOf } from "@discretion/roots/dates";
import { RootsError } from "@discretion/roots/errors";
import { checkTemplates } from "@discretion/roots/check";
import { install } from "@discretion/roots/install";
import { newNote, repairNote } from "@discretion/roots/notes";
import { status, type StatusItem } from "@discretion/roots/status";
import { templateDiff, templateReset } from "@discretion/roots/templates";

interface Output {
  write(text: string): unknown;
}

const usage = [
  "Usage: discretion roots install [--vault <dir>] [--dry-run] [--json]",
  "       discretion roots status [--vault <dir>] [--json]",
  "       discretion roots new <kind> [<date>] [--vault <dir>] [--dry-run] [--json]",
  "       discretion roots repair <note-or-date> [--vault <dir>] [--dry-run] [--json]",
  "       discretion roots template check [<kind>] [--vault <dir>] [--json]",
  "       discretion roots template diff <kind> [--vault <dir>] [--json]",
  "       discretion roots template reset <kind> [--vault <dir>] [--dry-run] [--json]",
  `<kind> is one of ${noteKinds.join(", ")}; <date> is YYYY-MM-DD.`,
  "",
].join("\n");

const options = {
  vault: { type: "string" },
  "dry-run": { type: "boolean" },
  json: { type: "boolean" },
} as const;

const isKind = (value: string | undefined): value is NoteKind =>
  (noteKinds as readonly string[]).includes(value ?? "");
const isTemplate = (value: string | undefined): value is TemplateName =>
  (templateNames as readonly string[]).includes(value ?? "");
const launcherCount = launcherNames.length;

/** Whether `value` is a real calendar date written YYYY-MM-DD. */
function isDate(value: string): boolean {
  try {
    periodOf("daily", value);
    return true;
  } catch {
    return false;
  }
}

/** The vault named by `--vault`, else by `[vault] path` in the config, else `~/vault`. */
async function vaultPath(flag: string | undefined): Promise<string> {
  if (flag !== undefined) return resolve(flag);
  const config = join(homedir(), ".config", "discretion", "discretion.toml");
  const configured = existsSync(config) ? (await readConfig(config)).vault?.path : undefined;
  const path = configured ?? "~/vault";
  return path === "~" || path.startsWith("~/") ? join(homedir(), path.slice(1)) : resolve(path);
}

function lines(items: StatusItem[]): string {
  if (items.length === 0) return "no drift\n";
  return `${items.map((i) => `drift ${i.kind} ${i.name}: ${i.message}`).join("\n")}\n`;
}

/** `discretion roots …`: 0 on success, 1 on a refusal or drift, 2 on bad usage. */
export async function rootsCommand(
  argv: string[],
  stdout: Output,
  stderr: Output,
): Promise<number> {
  const [sub, ...rest] = argv;
  let parsed: ReturnType<typeof parseArgs<{ options: typeof options; allowPositionals: true }>>;
  try {
    parsed = parseArgs({ args: rest, options, allowPositionals: true });
  } catch {
    stderr.write(usage);
    return 2;
  }
  const { values, positionals } = parsed;
  const json = values.json === true;
  const dryRun = values["dry-run"] === true;
  try {
    if (sub === "install" && positionals.length === 0) {
      const result = await install({
        vault: await vaultPath(values.vault),
        dryRun,
        ...(process.env.DISCRETION_GITHUB_BASE === undefined
          ? {}
          : { githubBase: process.env.DISCRETION_GITHUB_BASE }),
      });
      if (json) {
        stdout.write(`${stableStringify({ changes: result.changes, dry_run: dryRun })}\n`);
      } else {
        const prefix = dryRun ? "would: " : "";
        const done = result.changes.map((c) => `${c.startsWith("note: ") ? "" : prefix}${c}\n`);
        stdout.write(done.length > 0 ? done.join("") : "nothing to do\n");
      }
      return 0;
    }
    if (sub === "status" && positionals.length === 0 && !dryRun) {
      const items = await status({ vault: await vaultPath(values.vault) });
      stdout.write(json ? `${stableStringify({ items })}\n` : lines(items));
      return items.length > 0 ? 1 : 0;
    }
    if (sub === "new" && (positionals.length === 1 || positionals.length === 2)) {
      const [kind, given] = positionals;
      if (!isKind(kind) || (given !== undefined && !isDate(given))) {
        stderr.write(usage);
        return 2;
      }
      const result = await newNote({
        vault: await vaultPath(values.vault),
        kind,
        date: given ?? today(systemClock),
        dryRun,
      });
      if (json) {
        stdout.write(
          `${stableStringify({ created: result.created, dry_run: dryRun, path: result.path })}\n`,
        );
      } else if (!result.created) {
        stdout.write(`${result.path} already exists; left as it is\n`);
      } else {
        stdout.write(`${dryRun ? "would: create" : "created"} ${result.path}\n`);
      }
      return 0;
    }
    if (sub === "repair" && positionals.length === 1) {
      const result = await repairNote({
        vault: await vaultPath(values.vault),
        target: positionals[0] as string,
        dryRun,
      });
      if (json) {
        stdout.write(`${stableStringify({ ...result, dry_run: dryRun })}\n`);
      } else if (!result.changed) {
        stdout.write(`${result.path} needs no repair\n`);
      } else {
        stdout.write(dryRun ? result.diff : `repaired ${result.path}\n`);
      }
      return 0;
    }
    if (sub === "template") {
      const [action, kind, ...extra] = positionals;
      const templateKind = kind as string | undefined;
      const valid =
        extra.length === 0 &&
        ((action === "check" && (kind === undefined || isKind(kind))) ||
          ((action === "diff" || action === "reset") && isTemplate(kind)));
      if (!valid || (dryRun && action !== "reset")) {
        stderr.write(usage);
        return 2;
      }
      const vault = await vaultPath(values.vault);
      if (action === "check") {
        const problems = checkTemplates({
          vault,
          ...(templateKind === undefined ? {} : { kind: templateKind as NoteKind }),
        });
        const errors = problems.some((p) => p.severity === "error");
        if (json) {
          stdout.write(`${stableStringify({ ok: !errors, problems })}\n`);
        } else if (problems.length === 0) {
          stdout.write(
            templateKind === undefined
              ? `ok: ${templateNames.length} templates and ${launcherCount} launchers\n`
              : `ok: ${templateKind}.md\n`,
          );
        } else {
          for (const p of problems) {
            const where = p.line === null ? p.file : `${p.file}:${p.line}`;
            stdout.write(`${p.severity} ${where}: ${p.message}\n  fix: ${p.fix}\n`);
          }
        }
        return errors ? 1 : 0;
      }
      const name = templateKind as TemplateName;
      if (action === "diff") {
        const diff = await templateDiff(vault, name);
        if (json) stdout.write(`${stableStringify({ diff, template: name })}\n`);
        else stdout.write(diff === "" ? `${name}.md is the shipped default\n` : diff);
        return 0;
      }
      const changed = await templateReset(vault, name, dryRun);
      if (json) {
        stdout.write(`${stableStringify({ changed, dry_run: dryRun, template: name })}\n`);
      } else if (!changed) {
        stdout.write(`${name}.md is already the shipped default\n`);
      } else {
        stdout.write(`${dryRun ? "would: reset" : "reset"} ${name}.md to the shipped default\n`);
      }
      return 0;
    }
  } catch (error) {
    if (error instanceof RootsError) {
      stderr.write(`${new DiscretionError(error.code, error.message, error.remedy).format()}\n`);
      return 1;
    }
    if (error instanceof DiscretionError) {
      stderr.write(`${error.format()}\n`);
      return 1;
    }
    throw error;
  }
  stderr.write(usage);
  return 2;
}
