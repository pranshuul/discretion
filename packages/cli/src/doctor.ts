import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { DiscretionError, loadConfig, readConfig } from "@discretion/core";

const exec = promisify(execFile);

export type Status = "ok" | "warn" | "error";

export interface Finding {
  check: "config" | "secrets" | "ollama" | "tailscale" | "root-encryption";
  status: Status;
  message: string;
  remedy?: string;
}

export interface DoctorOptions {
  /** Path of `discretion.toml`. */
  configPath: string;
  /** Environment for the child processes (`sops`, `tailscale`, `findmnt`, `lsblk`). */
  env: NodeJS.ProcessEnv;
}

/** Ollama's address when the config cannot say (the `config/1` default). */
const defaultOllama = "http://127.0.0.1:11434";
const probeTimeoutMs = 5000;

function refusal(check: "config" | "secrets", error: unknown): Finding {
  if (error instanceof DiscretionError) {
    return {
      check,
      status: "error",
      message: `${error.code} ${error.message}`,
      remedy: error.remedy,
    };
  }
  throw error;
}

async function checkOllama(endpoint: string): Promise<Finding> {
  const url = `${endpoint.replace(/\/+$/, "")}/api/tags`;
  const remedy = "Start Ollama (`systemctl start ollama`) and check [models.local] endpoint.";
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(probeTimeoutMs) });
    if (response.ok) {
      return { check: "ollama", status: "ok", message: `Ollama answers at ${endpoint}.` };
    }
    return {
      check: "ollama",
      status: "error",
      message: `Ollama at ${endpoint} answered with status ${response.status}.`,
      remedy,
    };
  } catch (error) {
    const cause = (error as { cause?: { code?: string } }).cause?.code ?? (error as Error).name;
    return {
      check: "ollama",
      status: "error",
      message: `Ollama does not answer at ${endpoint} (${cause}).`,
      remedy,
    };
  }
}

async function checkTailscale(env: NodeJS.ProcessEnv): Promise<Finding> {
  const remedy = "Install Tailscale and connect with `sudo tailscale up`.";
  let stdout: string;
  try {
    ({ stdout } = await exec("tailscale", ["status", "--json"], {
      env,
      maxBuffer: 16 * 1024 * 1024,
    }));
  } catch (error) {
    const failure = error as { stderr?: string; message: string };
    const detail = (failure.stderr || failure.message).trim().split("\n")[0] ?? "";
    return {
      check: "tailscale",
      status: "error",
      message: `\`tailscale status\` failed: ${detail}`,
      remedy,
    };
  }
  let state: unknown;
  try {
    state = (JSON.parse(stdout) as { BackendState?: unknown }).BackendState;
  } catch {
    return {
      check: "tailscale",
      status: "error",
      message: "`tailscale status --json` did not print JSON.",
      remedy,
    };
  }
  if (state === "Running") {
    return { check: "tailscale", status: "ok", message: "Tailscale is connected." };
  }
  return {
    check: "tailscale",
    status: "error",
    message: `Tailscale is not connected (state: ${typeof state === "string" ? state : "unknown"}).`,
    remedy,
  };
}

/** An unencrypted root is a warning by decision 18, so every failure to tell is one too. */
async function checkRootEncryption(env: NodeJS.ProcessEnv): Promise<Finding> {
  const accepted =
    "Accepted by choice (disk encryption skipped); keep the offline copy of the age key safe.";
  try {
    const { stdout: source } = await exec("findmnt", ["-n", "-o", "SOURCE", "--target", "/"], {
      env,
    });
    const device = source.trim().replace(/\[.*\]$/, "");
    const { stdout } = await exec("lsblk", ["-s", "-n", "-o", "TYPE", device], { env });
    if (stdout.split("\n").some((line) => line.trim() === "crypt")) {
      return {
        check: "root-encryption",
        status: "ok",
        message: "The root filesystem is encrypted.",
      };
    }
    return {
      check: "root-encryption",
      status: "warn",
      message: "The root filesystem is not encrypted.",
      remedy: accepted,
    };
  } catch {
    return {
      check: "root-encryption",
      status: "warn",
      message: "Could not tell whether the root filesystem is encrypted.",
      remedy: "Install findmnt and lsblk (util-linux) to check it.",
    };
  }
}

/** Runs every check and returns one finding per check, in a fixed order. */
export async function runDoctor(options: DoctorOptions): Promise<Finding[]> {
  const findings: Finding[] = [];
  let endpoint = defaultOllama;
  let valid = false;
  try {
    endpoint = (await readConfig(options.configPath)).models?.local?.endpoint ?? defaultOllama;
    valid = true;
    findings.push({ check: "config", status: "ok", message: `${options.configPath} is valid.` });
  } catch (error) {
    findings.push(refusal("config", error));
  }
  if (valid) {
    try {
      await loadConfig(options.configPath, { env: options.env });
      findings.push({ check: "secrets", status: "ok", message: "Every secret decrypts." });
    } catch (error) {
      findings.push(refusal("secrets", error));
    }
  } else {
    findings.push({
      check: "secrets",
      status: "error",
      message: "Secrets were not checked because the config is not valid.",
      remedy: "Fix the config first.",
    });
  }
  findings.push(await checkOllama(endpoint));
  findings.push(await checkTailscale(options.env));
  findings.push(await checkRootEncryption(options.env));
  return findings;
}

/** Text for people: one line per finding, the remedy on the next line. */
export function formatFindings(findings: Finding[]): string {
  return findings
    .map((finding) => {
      const line = `${finding.status.padEnd(5)} ${finding.check}: ${finding.message}\n`;
      return finding.status === "ok" || finding.remedy === undefined
        ? line
        : `${line}      Remedy: ${finding.remedy}\n`;
    })
    .join("");
}
