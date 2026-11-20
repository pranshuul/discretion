import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { DiscretionError, readConfig, stableStringify } from "@discretion/core";
import { templateNames, type TemplateName } from "@discretion/roots/assets";
import { install } from "@discretion/roots/install";
import { status, type StatusItem } from "@discretion/roots/status";
import { templateDiff, templateReset } from "@discretion/roots/templates";

interface Output {
  write(text: string): unknown;
}

const usage = [
  "Usage: discretion roots install [--vault <dir>] [--dry-run] [--json]",
  "       discretion roots status [--vault <dir>] [--json]",
  "       discretion roots template diff <kind> [--vault <dir>] [--json]",
  "       discretion roots template reset <kind> [--vault <dir>] [--dry-run] [--json]",
  "",
].join("\n");

const templateUsage = [
  `Usage: discretion roots template diff|reset <kind> [--vault <dir>] [--dry-run] [--json]`,
  `<kind> is one of ${templateNames.join(", ")}.`,
  "",
].join("\n");

const options = {
  vault: { type: "string" },
  "dry-run": { type: "boolean" },
  json: { type: "boolean" },
} as const;

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
  return `${items.map((i) => `${i.severity} ${i.kind} ${i.name}: ${i.message}`).join("\n")}\n`;
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
        stdout.write(
          `${stableStringify({ changes: result.changes, dry_run: dryRun, notices: result.notices })}\n`,
        );
      } else {
        const prefix = dryRun ? "would: " : "";
        const done = result.changes.map((c) => `${prefix}${c}\n`);
        stdout.write(done.length > 0 ? done.join("") : "nothing to do\n");
        for (const notice of result.notices) stdout.write(`note: ${notice}\n`);
      }
      return 0;
    }
    if (sub === "status" && positionals.length === 0 && !dryRun) {
      const items = await status({ vault: await vaultPath(values.vault) });
      stdout.write(json ? `${stableStringify({ items })}\n` : lines(items));
      return items.some((i) => i.severity === "drift") ? 1 : 0;
    }
    if (sub === "template") {
      const [action, kind, ...extra] = positionals;
      const known = (templateNames as readonly string[]).includes(kind ?? "");
      if ((action !== "diff" && action !== "reset") || !known || extra.length > 0) {
        stderr.write(templateUsage);
        return 2;
      }
      const name = kind as TemplateName;
      const vault = await vaultPath(values.vault);
      if (action === "diff") {
        if (dryRun) {
          stderr.write(templateUsage);
          return 2;
        }
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
    if (error instanceof DiscretionError) {
      stderr.write(`${error.format()}\n`);
      return 1;
    }
    throw error;
  }
  stderr.write(usage);
  return 2;
}
