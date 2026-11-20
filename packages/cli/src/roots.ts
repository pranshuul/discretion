import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { DiscretionError, readConfig, stableStringify } from "@discretion/core";
import { install } from "@discretion/roots/install";
import { status, type StatusItem } from "@discretion/roots/status";

interface Output {
  write(text: string): unknown;
}

const usage = [
  "Usage: discretion roots install [--vault <dir>] [--dry-run] [--json]",
  "       discretion roots status [--vault <dir>] [--json]",
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
        const done = result.changes.map((c) => `${prefix}${c}\n`);
        stdout.write(done.length > 0 ? done.join("") : "nothing to do\n");
      }
      return 0;
    }
    if (sub === "status" && positionals.length === 0 && !dryRun) {
      const items = await status({ vault: await vaultPath(values.vault) });
      stdout.write(json ? `${stableStringify({ items })}\n` : lines(items));
      return items.length > 0 ? 1 : 0;
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
