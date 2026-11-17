import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";
import { DiscretionError } from "../src/errors.js";
import { fakeSops, scratch } from "./helpers.js";

const planExample = `
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
endpoint = "http://127.0.0.1:11434"
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

function write(text: string): string {
  const path = join(scratch(), "discretion.toml");
  writeFileSync(path, text);
  return path;
}

async function refusal(path: string, env?: NodeJS.ProcessEnv): Promise<DiscretionError> {
  const error = await loadConfig(path, { env }).then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(DiscretionError);
  return error as DiscretionError;
}

describe("config loader", () => {
  it("loads the plan's whole example and resolves every secret", async () => {
    const sops = fakeSops(secrets);
    const { config, secrets: values } = await loadConfig(write(planExample), { env: sops.env });
    expect(config.telegram?.bot_token).toBe("tg-token-1111");
    expect(config.relay?.token).toBe("relay-token-2222");
    expect(config.models?.jev?.api_key).toBe("jev-key-3333");
    expect(config.install?.profiles?.vps).toBe(true);
    expect(config.spend?.steps?.downgrade).toBe(0.9);
    expect(config.tracking?.rhythm?.long_break_every).toEqual([3, 4]);
    expect([...values].sort()).toEqual(["jev-key-3333", "relay-token-2222", "tg-token-1111"]);
  });

  it("decrypts secrets.sops.yaml next to the config with `sops -d`", async () => {
    const sops = fakeSops(secrets);
    const path = write(planExample);
    await loadConfig(path, { env: sops.env });
    const args = readFileSync(sops.args, "utf8").trim().split("\n");
    expect(args).toContain("-d");
    expect(args.at(-1)).toBe(join(path, "..", "secrets.sops.yaml"));
  });

  it("does not run sops when the file names no secret", async () => {
    const sops = fakeSops("{}", 1);
    const { config, secrets: values } = await loadConfig(
      write('schema = "config/1"\n[vault]\npath = "~/vault"\n'),
      { env: sops.env },
    );
    expect(config.vault?.path).toBe("~/vault");
    expect(values).toEqual([]);
  });

  it("resolves secrets inside lists", async () => {
    const sops = fakeSops(JSON.stringify({ GLOB: "x/**" }));
    const { config } = await loadConfig(
      write('schema = "config/1"\n[privacy]\nfrontier_allowed = ["secret:GLOB", "y/**"]\n'),
      { env: sops.env },
    );
    expect(config.privacy?.frontier_allowed).toEqual(["x/**", "y/**"]);
  });

  it("refuses an unknown top-level key with D6001", async () => {
    const error = await refusal(write('schema = "config/1"\nsurprise = 1\n'));
    expect(error.code).toBe("D6001");
    expect(error.message).toContain("surprise");
    expect(error.remedy).not.toBe("");
  });

  it("refuses an unknown nested key with D6001 and names its path", async () => {
    const error = await refusal(write('schema = "config/1"\n[telegram]\nsurprise = 1\n'));
    expect(error.code).toBe("D6001");
    expect(error.message).toContain("telegram.surprise");
  });

  it("refuses an unknown key inside an inline table with D6001", async () => {
    const error = await refusal(
      write('schema = "config/1"\n[install]\nprofiles = { vps = true, cloud = true }\n'),
    );
    expect(error.code).toBe("D6001");
    expect(error.message).toContain("install.profiles.cloud");
  });

  it("names every unknown key at once", async () => {
    const error = await refusal(write('schema = "config/1"\na = 1\n[relay]\nb = 2\n'));
    expect(error.message).toContain("a");
    expect(error.message).toContain("relay.b");
  });

  it("refuses a missing schema or another version with D6002", async () => {
    expect((await refusal(write("[vault]\npath = 'x'\n"))).code).toBe("D6002");
    expect((await refusal(write('schema = "config/2"\n'))).code).toBe("D6002");
  });

  it("refuses a value of the wrong type with D6002", async () => {
    const error = await refusal(write('schema = "config/1"\n[vault]\nidle_commit_minutes = "x"\n'));
    expect(error.code).toBe("D6002");
    expect(error.message).toContain("vault.idle_commit_minutes");
  });

  it("refuses invalid TOML with D6002", async () => {
    expect((await refusal(write("schema = ="))).code).toBe("D6002");
  });

  it("refuses a missing file with D6002", async () => {
    expect((await refusal(join(scratch(), "absent.toml"))).code).toBe("D6002");
  });

  it("refuses an unresolved secret with D6003, naming it and never a value", async () => {
    const sops = fakeSops(JSON.stringify({ OTHER: "other-value-9999" }));
    const error = await refusal(
      write('schema = "config/1"\n[relay]\ntoken = "secret:RELAY_TOKEN"\n'),
      sops.env,
    );
    expect(error.code).toBe("D6003");
    expect(error.message).toContain("RELAY_TOKEN");
    expect(error.format()).not.toContain("other-value-9999");
  });

  it("refuses a secret whose value is not a string with D6003", async () => {
    const sops = fakeSops(JSON.stringify({ RELAY_TOKEN: 12345 }));
    const error = await refusal(
      write('schema = "config/1"\n[relay]\ntoken = "secret:RELAY_TOKEN"\n'),
      sops.env,
    );
    expect(error.code).toBe("D6003");
  });

  it("refuses with D6004 when sops cannot decrypt", async () => {
    const sops = fakeSops("", 1);
    const error = await refusal(write(planExample), sops.env);
    expect(error.code).toBe("D6004");
  });

  it("refuses with D6004 when sops is not installed", async () => {
    const error = await refusal(write(planExample), { PATH: scratch() });
    expect(error.code).toBe("D6004");
  });

  it("refuses with D6004 when sops prints something that is not a map of strings", async () => {
    const error = await refusal(write(planExample), fakeSops("[1]").env);
    expect(error.code).toBe("D6004");
  });
});

const haveSops =
  spawnSync("sops", ["--version"]).status === 0 && spawnSync("age-keygen", ["-h"]).status === 0;

describe.skipIf(!haveSops)("config loader with the real sops and age", () => {
  it("decrypts an age-encrypted secrets.sops.yaml", async () => {
    const dir = scratch();
    const keyFile = join(dir, "key.txt");
    const keygen = spawnSync("age-keygen", ["-o", keyFile], { encoding: "utf8" });
    const recipient = /Public key: (age1\w+)/.exec(keygen.stderr + keygen.stdout)?.[1];
    expect(recipient).toBeDefined();
    const plain = join(dir, "plain.yaml");
    writeFileSync(plain, "RELAY_TOKEN: real-relay-token-4444\n");
    const encrypted = spawnSync(
      "sops",
      [
        "--encrypt",
        "--age",
        recipient ?? "",
        "--input-type",
        "yaml",
        "--output-type",
        "yaml",
        plain,
      ],
      { encoding: "utf8" },
    );
    expect(encrypted.status).toBe(0);
    writeFileSync(join(dir, "secrets.sops.yaml"), encrypted.stdout);
    writeFileSync(
      join(dir, "discretion.toml"),
      'schema = "config/1"\n[relay]\ntoken = "secret:RELAY_TOKEN"\n',
    );
    const loaded = await loadConfig(join(dir, "discretion.toml"), {
      env: { ...process.env, SOPS_AGE_KEY_FILE: keyFile },
    });
    expect(loaded.config.relay?.token).toBe("real-relay-token-4444");
    expect(loaded.secrets).toEqual(["real-relay-token-4444"]);

    const wrongKey = join(dir, "wrong.txt");
    spawnSync("age-keygen", ["-o", wrongKey]);
    const error = await refusal(join(dir, "discretion.toml"), {
      ...process.env,
      SOPS_AGE_KEY_FILE: wrongKey,
    });
    expect(error.code).toBe("D6004");
  });
});
