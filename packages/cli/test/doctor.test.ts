import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { formatFindings, runDoctor, type Finding } from "../src/doctor.js";

const bin = fileURLToPath(new URL("../bin/discretion.js", import.meta.url));
const made: string[] = [];
const servers: Server[] = [];

afterEach(async () => {
  for (const dir of made.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
  await Promise.all(
    servers.splice(0).map((server) => new Promise((done) => server.close(() => done(undefined)))),
  );
});

function scratch(): string {
  const dir = mkdtempSync(join(tmpdir(), "discretion-doctor-"));
  made.push(dir);
  return dir;
}

const configText = (ollama: string): string => `
schema = "config/1"

[install]
timezone = "Asia/Kolkata"
profiles = { vps = true, always_on = false, gpu_node = false }

[vault]
path = "~/vault"
idle_commit_minutes = 30

[telegram]
bot_token = "secret:TELEGRAM_BOT_TOKEN"
owner_chat_id = 0

[relay]
url = "https://<vps>.<tailnet>.ts.net"
token = "secret:RELAY_TOKEN"

[models.jev]
endpoint = "<Jev API endpoint>"
model = "<Jev model id>"
api_key = "secret:JEV_API_KEY"
max_input_tokens = 0

[models.local]
endpoint = "${ollama}"
filing_model = ""
librarian_model = ""

[models.transcription]
primary = { kind = "phonon", endpoint = "http://127.0.0.1:8178/v1" }
fallback = { kind = "whisper", endpoint = "http://127.0.0.1:8179/v1" }

[models.lanes]
workhorse = "anthropic:<sonnet-class model id>"
heavy = "anthropic:<top model id>"
cheap_api = "<provider:model>"

[spend]
monthly_cap_usd = 0
steps = { digest = 0.70, downgrade = 0.90, pause = 1.00 }

[privacy]
frontier_allowed = ["2-Orchard/**", "3-Mycelium/**", "4-Nursery/**", "1-Roots/**#public"]

[tracking]
rhythm = { short = [25, 5], long = [45, 10], long_break = [20, 30], long_break_every = [3, 4] }
estimate_padding = 0.5
`;

const secrets = JSON.stringify({
  TELEGRAM_BOT_TOKEN: "tg-token-1111",
  RELAY_TOKEN: "relay-token-2222",
  JEV_API_KEY: "jev-key-3333",
});

async function ollama(status = 200): Promise<string> {
  const server = createServer((request, response) => {
    response.statusCode = request.url === "/api/tags" ? status : 404;
    response.end('{"models":[]}');
  });
  servers.push(server);
  await new Promise((done) => server.listen(0, "127.0.0.1", () => done(undefined)));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

interface Machine {
  sops?: { output: string; status: number };
  tailscale?: { output: string; status: number } | "missing";
  /** `lsblk -s` TYPE lines for the root source; "missing" makes findmnt fail. */
  rootTypes?: string[] | "missing";
}

function tool(dir: string, name: string, body: string): void {
  writeFileSync(join(dir, name), `#!/bin/sh\n${body}\n`);
  chmodSync(join(dir, name), 0o755);
}

/** A directory of stand-in tools used as the only PATH entry besides the system's. */
function machine(m: Machine): NodeJS.ProcessEnv {
  const dir = scratch();
  const path = join(dir, "bin");
  mkdirSync(path);
  const sops = m.sops ?? { output: secrets, status: 0 };
  tool(path, "sops", `cat <<'END'\n${sops.output}\nEND\nexit ${sops.status}`);
  if (m.tailscale !== "missing") {
    const ts = m.tailscale ?? { output: '{"BackendState":"Running"}', status: 0 };
    tool(path, "tailscale", `cat <<'END'\n${ts.output}\nEND\nexit ${ts.status}`);
  }
  if (m.rootTypes !== "missing") {
    tool(path, "findmnt", "echo /dev/mapper/root");
    const types = (m.rootTypes ?? ["part", "disk"]).join("\\n");
    tool(path, "lsblk", `printf '${types}\\n'`);
  } else {
    tool(path, "findmnt", "exit 1");
  }
  return { PATH: `${path}:/usr/bin:/bin` };
}

function configFile(text: string): string {
  const dir = scratch();
  mkdirSync(join(dir, ".config", "discretion"), { recursive: true });
  const path = join(dir, ".config", "discretion", "discretion.toml");
  writeFileSync(path, text);
  return path;
}

function byCheck(findings: Finding[], check: Finding["check"]): Finding {
  const found = findings.find((finding) => finding.check === check);
  expect(found).toBeDefined();
  return found as Finding;
}

describe("runDoctor", () => {
  it("reports one finding per check, in a fixed order, all ok on a healthy machine", async () => {
    const configPath = configFile(configText(await ollama()));
    const findings = await runDoctor({
      configPath,
      env: machine({ rootTypes: ["part", "crypt", "disk"] }),
    });
    expect(findings.map((finding) => finding.check)).toEqual([
      "config",
      "secrets",
      "ollama",
      "tailscale",
      "root-encryption",
    ]);
    expect(findings.map((finding) => finding.status)).toEqual(["ok", "ok", "ok", "ok", "ok"]);
  });

  it("reports an unencrypted root filesystem as a warning, not an error", async () => {
    const configPath = configFile(configText(await ollama()));
    const findings = await runDoctor({ configPath, env: machine({}) });
    const root = byCheck(findings, "root-encryption");
    expect(root.status).toBe("warn");
    expect(root.remedy).toBeTruthy();
    expect(findings.filter((finding) => finding.status === "error")).toEqual([]);
  });

  it("warns, never errors, when the root filesystem cannot be inspected", async () => {
    const configPath = configFile(configText(await ollama()));
    const findings = await runDoctor({ configPath, env: machine({ rootTypes: "missing" }) });
    expect(byCheck(findings, "root-encryption").status).toBe("warn");
  });

  it("errors on a config with an unknown key and skips the secrets check", async () => {
    const configPath = configFile(`${configText(await ollama())}\n[bogus]\nx = 1\n`);
    const findings = await runDoctor({ configPath, env: machine({}) });
    const config = byCheck(findings, "config");
    expect(config.status).toBe("error");
    expect(config.message).toContain("D6001");
    expect(config.remedy).toBeTruthy();
    expect(byCheck(findings, "secrets").status).toBe("error");
  });

  it("errors on a missing config file", async () => {
    const dir = scratch();
    const findings = await runDoctor({
      configPath: join(dir, "discretion.toml"),
      env: machine({}),
    });
    expect(byCheck(findings, "config").status).toBe("error");
  });

  it("passes config but errors on secrets that do not decrypt", async () => {
    const configPath = configFile(configText(await ollama()));
    const findings = await runDoctor({
      configPath,
      env: machine({ sops: { output: "", status: 1 } }),
    });
    expect(byCheck(findings, "config").status).toBe("ok");
    const secretsFinding = byCheck(findings, "secrets");
    expect(secretsFinding.status).toBe("error");
    expect(secretsFinding.message).toContain("D6004");
  });

  it("errors when a referenced secret is missing from the file", async () => {
    const configPath = configFile(configText(await ollama()));
    const findings = await runDoctor({
      configPath,
      env: machine({ sops: { output: '{"RELAY_TOKEN":"x"}', status: 0 } }),
    });
    expect(byCheck(findings, "secrets").message).toContain("D6003");
  });

  it("never prints a secret value", async () => {
    const configPath = configFile(configText(await ollama()));
    const findings = await runDoctor({ configPath, env: machine({}) });
    const text = JSON.stringify(findings) + formatFindings(findings);
    expect(text).not.toContain("tg-token-1111");
    expect(text).not.toContain("jev-key-3333");
  });

  it("errors when Ollama does not answer at the configured endpoint", async () => {
    const configPath = configFile(configText("http://127.0.0.1:1"));
    const findings = await runDoctor({ configPath, env: machine({}) });
    const found = byCheck(findings, "ollama");
    expect(found.status).toBe("error");
    expect(found.message).toContain("http://127.0.0.1:1");
    expect(found.remedy).toBeTruthy();
  });

  it("errors when Ollama answers with a failure status", async () => {
    const configPath = configFile(configText(await ollama(500)));
    const findings = await runDoctor({ configPath, env: machine({}) });
    expect(byCheck(findings, "ollama").status).toBe("error");
  });

  it("errors when Tailscale is not running", async () => {
    const configPath = configFile(configText(await ollama()));
    const findings = await runDoctor({
      configPath,
      env: machine({ tailscale: { output: '{"BackendState":"Stopped"}', status: 0 } }),
    });
    const found = byCheck(findings, "tailscale");
    expect(found.status).toBe("error");
    expect(found.message).toContain("Stopped");
  });

  it("errors when Tailscale is not installed or its output is not JSON", async () => {
    const configPath = configFile(configText(await ollama()));
    const missing = await runDoctor({ configPath, env: machine({ tailscale: "missing" }) });
    expect(byCheck(missing, "tailscale").status).toBe("error");
    const garbled = await runDoctor({
      configPath,
      env: machine({ tailscale: { output: "not json", status: 0 } }),
    });
    expect(byCheck(garbled, "tailscale").status).toBe("error");
  });
});

describe("formatFindings", () => {
  it("prints a line per finding and the remedy under any that is not ok", () => {
    const text = formatFindings([
      { check: "config", status: "ok", message: "config is valid" },
      { check: "ollama", status: "error", message: "no answer", remedy: "start ollama" },
      { check: "root-encryption", status: "warn", message: "unencrypted", remedy: "accepted" },
    ]);
    expect(text).toBe(
      [
        "ok    config: config is valid",
        "error ollama: no answer",
        "      Remedy: start ollama",
        "warn  root-encryption: unencrypted",
        "      Remedy: accepted",
        "",
      ].join("\n"),
    );
  });
});

describe("discretion doctor", () => {
  async function home(
    m: Machine,
    ollamaUrl?: string,
  ): Promise<{ dir: string; env: NodeJS.ProcessEnv }> {
    const configPath = configFile(configText(ollamaUrl ?? (await ollama())));
    const dir = join(configPath, "..", "..", "..");
    return { dir, env: { ...machine(m), HOME: dir } };
  }

  it("exits 0 with only a warning and prints --json findings", async () => {
    const { dir, env } = await home({});
    const result = spawnSync(process.execPath, [bin, "doctor", "--json"], {
      cwd: dir,
      encoding: "utf8",
      env,
    });
    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
    const printed = JSON.parse(result.stdout) as { findings: Finding[] };
    expect(printed.findings.map((finding) => finding.status)).toEqual([
      "ok",
      "ok",
      "ok",
      "ok",
      "warn",
    ]);
  });

  it("prints text and exits 1 when any check is an error", async () => {
    const { dir, env } = await home({ tailscale: "missing" }, "http://127.0.0.1:1");
    const result = spawnSync(process.execPath, [bin, "doctor"], {
      cwd: dir,
      encoding: "utf8",
      env,
    });
    expect(result.status).toBe(1);
    expect(result.stdout).toContain("error ollama:");
    expect(result.stdout).toContain("error tailscale:");
  });

  it("refuses unknown arguments with usage and exit 2", async () => {
    const { dir, env } = await home({});
    const result = spawnSync(process.execPath, [bin, "doctor", "--bogus"], {
      cwd: dir,
      encoding: "utf8",
      env,
    });
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("Usage: discretion doctor");
  });
});
