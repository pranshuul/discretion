import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { Config } from "@discretion/model";
import { parse } from "@iarna/toml";
import { DiscretionError } from "./errors.js";

const run = promisify(execFile);

const prefix = "secret:";

export interface LoadOptions {
  /** Environment for the `sops` child process; defaults to the current one. */
  env?: NodeJS.ProcessEnv;
}

export interface LoadedConfig {
  config: Config;
  /** Every resolved secret value, for the logger to scrub. */
  secrets: string[];
}

function invalid(file: string, detail: string): DiscretionError {
  return new DiscretionError(
    "D6002",
    `${file} is not a valid config/1 file: ${detail}`,
    "Fix the file so it matches schemas/config/1.json.",
  );
}

/** The names of every `secret:NAME` string in the tree. */
function references(value: unknown, into: Set<string>): void {
  if (typeof value === "string") {
    if (value.startsWith(prefix)) {
      into.add(value.slice(prefix.length));
    }
  } else if (Array.isArray(value)) {
    value.forEach((item) => references(item, into));
  } else if (value !== null && typeof value === "object") {
    Object.values(value).forEach((item) => references(item, into));
  }
}

function substitute(value: unknown, secrets: ReadonlyMap<string, string>): unknown {
  if (typeof value === "string") {
    return value.startsWith(prefix) ? secrets.get(value.slice(prefix.length)) : value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => substitute(item, secrets));
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, substitute(item, secrets)]),
    );
  }
  return value;
}

function decryptionFailed(file: string, detail: string): DiscretionError {
  return new DiscretionError(
    "D6004",
    `sops could not decrypt ${file}: ${detail}`,
    "Install sops, point SOPS_AGE_KEY_FILE at the age key, and check that the file exists.",
  );
}

/** Runs `sops -d` and returns every secret in the file by name. */
async function decrypt(file: string, env: NodeJS.ProcessEnv | undefined): Promise<unknown> {
  let stdout: string;
  try {
    ({ stdout } = await run("sops", ["-d", "--output-type", "json", file], {
      env,
      maxBuffer: 16 * 1024 * 1024,
    }));
  } catch (error) {
    const failure = error as { stderr?: string; message: string };
    const detail = (failure.stderr || failure.message).trim().split("\n")[0] ?? "";
    throw decryptionFailed(file, detail);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    throw decryptionFailed(file, "its output is not JSON");
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw decryptionFailed(file, "its output is not a map of names to values");
  }
  return parsed;
}

/** Reads `discretion.toml` and refuses unknown keys, leaving `secret:NAME` values unresolved. */
export async function readConfig(path: string): Promise<Config> {
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch (error) {
    throw invalid(path, (error as Error).message);
  }
  let raw: unknown;
  try {
    raw = parse(text);
  } catch (error) {
    throw invalid(path, (error as Error).message);
  }

  const checked = Config.safeParse(raw);
  if (!checked.success) {
    const unknown = checked.error.issues.flatMap((issue) =>
      issue.code === "unrecognized_keys"
        ? issue.keys.map((key) => [...issue.path, key].join("."))
        : [],
    );
    if (unknown.length > 0) {
      throw new DiscretionError(
        "D6001",
        `${path} has unknown keys: ${unknown.join(", ")}.`,
        "Remove or correct them; config/1 accepts only the keys in schemas/config/1.json.",
      );
    }
    throw invalid(
      path,
      checked.error.issues
        .map((issue) => `${issue.path.join(".") || "(file)"}: ${issue.message}`)
        .join("; "),
    );
  }

  return checked.data;
}

/** Reads `discretion.toml`, refuses unknown keys, resolves `secret:NAME` through `sops -d`. */
export async function loadConfig(path: string, options: LoadOptions = {}): Promise<LoadedConfig> {
  const parsed = await readConfig(path);
  const names = new Set<string>();
  references(parsed, names);
  if (names.size === 0) {
    return { config: parsed, secrets: [] };
  }

  const file = join(dirname(path), "secrets.sops.yaml");
  const decrypted = (await decrypt(file, options.env)) as Record<string, unknown>;
  const resolved = new Map<string, string>();
  const missing: string[] = [];
  for (const name of [...names].sort()) {
    const value = Object.hasOwn(decrypted, name) ? decrypted[name] : undefined;
    if (typeof value === "string") {
      resolved.set(name, value);
    } else {
      missing.push(name);
    }
  }
  if (missing.length > 0) {
    throw new DiscretionError(
      "D6003",
      `${path} refers to secrets that ${file} does not hold as strings: ${missing.join(", ")}.`,
      "Add them with `sops secrets.sops.yaml`, or correct the names in discretion.toml.",
    );
  }
  return {
    config: substitute(parsed, resolved) as Config,
    secrets: [...new Set(resolved.values())].filter((value) => value !== ""),
  };
}
