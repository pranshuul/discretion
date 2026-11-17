import { describe, expect, it } from "vitest";
import { Config } from "../src/index.js";

// The build plan's `discretion.toml`, as its TOML parses.
function sample(): Record<string, unknown> {
  return {
    schema: "config/1",
    install: {
      timezone: "Asia/Kolkata",
      profiles: { vps: true, always_on: false, gpu_node: false },
    },
    vault: { path: "~/vault", idle_commit_minutes: 30 },
    telegram: { bot_token: "secret:TELEGRAM_BOT_TOKEN", owner_chat_id: 0 },
    relay: { url: "https://<vps>.<tailnet>.ts.net", token: "secret:RELAY_TOKEN" },
    models: {
      jev: {
        endpoint: "<Jev API endpoint>",
        model: "<Jev model id>",
        api_key: "secret:JEV_API_KEY",
        max_input_tokens: 0,
      },
      local: { endpoint: "http://127.0.0.1:11434", filing_model: "", librarian_model: "" },
      transcription: {
        primary: { kind: "phonon", endpoint: "http://127.0.0.1:8178/v1" },
        fallback: { kind: "whisper", endpoint: "http://127.0.0.1:8179/v1" },
      },
      lanes: {
        workhorse: "anthropic:<sonnet-class model id>",
        heavy: "anthropic:<top model id>",
        cheap_api: "<provider:model>",
      },
    },
    spend: { monthly_cap_usd: 0, steps: { digest: 0.7, downgrade: 0.9, pause: 1.0 } },
    privacy: {
      frontier_allowed: ["2-Orchard/**", "3-Mycelium/**", "4-Nursery/**", "1-Roots/**#public"],
    },
    tracking: {
      rhythm: { short: [25, 5], long: [45, 10], long_break: [20, 30], long_break_every: [3, 4] },
      estimate_padding: 0.5,
    },
  };
}

type Path = (string | number)[];

// The sample with the value at `path` replaced, or removed when `value` is undefined.
function withValue(path: Path, value: unknown): unknown {
  const root = sample() as unknown as Record<string | number, unknown>;
  let at = root;
  for (const key of path.slice(0, -1)) {
    at = at[key] as Record<string | number, unknown>;
  }
  const last = path.at(-1) as string | number;
  if (value === undefined) {
    Reflect.deleteProperty(at, last);
  } else {
    at[last] = value;
  }
  return root;
}

const tables: Path[] = [
  [],
  ["install"],
  ["install", "profiles"],
  ["vault"],
  ["telegram"],
  ["relay"],
  ["models"],
  ["models", "jev"],
  ["models", "local"],
  ["models", "transcription"],
  ["models", "transcription", "primary"],
  ["models", "transcription", "fallback"],
  ["models", "lanes"],
  ["spend"],
  ["spend", "steps"],
  ["privacy"],
  ["tracking"],
  ["tracking", "rhythm"],
];

describe("config/1", () => {
  it("accepts the build plan's discretion.toml", () => {
    expect(Config.safeParse(sample()).success).toBe(true);
  });

  it("accepts a file that only names its schema, since no other key is marked required", () => {
    expect(Config.safeParse({ schema: "config/1" }).success).toBe(true);
  });

  it.each(tables.filter((path) => path.length > 0))("accepts a file without %j", (...path) => {
    expect(Config.safeParse(withValue(path, undefined)).success).toBe(true);
  });

  it("refuses a file without its schema marker", () => {
    expect(Config.safeParse(withValue(["schema"], undefined)).success).toBe(false);
  });

  it.each(["config/2", "runflow/1", 1])("refuses the schema marker %j", (marker) => {
    expect(Config.safeParse(withValue(["schema"], marker)).success).toBe(false);
  });

  it.each(tables)("refuses an unknown key in %j", (...path) => {
    expect(Config.safeParse(withValue([...path, "surprise"], 1)).success).toBe(false);
  });

  it.each<[Path, unknown]>([
    [["install"], "laptop"],
    [["install", "timezone"], 530],
    [["install", "profiles", "vps"], "yes"],
    [["install", "profiles", "always_on"], 1],
    [["install", "profiles", "gpu_node"], "no"],
    [["vault", "path"], 1],
    [["vault", "idle_commit_minutes"], 1.5],
    [["vault", "idle_commit_minutes"], "30"],
    [["telegram", "bot_token"], 12345],
    [["telegram", "owner_chat_id"], "0"],
    [["telegram", "owner_chat_id"], 1.5],
    [["relay", "url"], false],
    [["relay", "token"], 1],
    [["models", "jev", "endpoint"], 1],
    [["models", "jev", "model"], 1],
    [["models", "jev", "api_key"], 1],
    [["models", "jev", "max_input_tokens"], "8000"],
    [["models", "jev", "max_input_tokens"], 0.5],
    [["models", "local", "endpoint"], 11434],
    [["models", "local", "filing_model"], 1],
    [["models", "local", "librarian_model"], 1],
    [["models", "transcription", "primary"], "phonon"],
    [["models", "transcription", "primary", "kind"], "ollama"],
    [["models", "transcription", "primary", "endpoint"], 8178],
    [["models", "transcription", "fallback", "kind"], "jev"],
    [["models", "lanes", "workhorse"], 1],
    [["models", "lanes", "heavy"], 1],
    [["models", "lanes", "cheap_api"], 1],
    [["spend", "monthly_cap_usd"], "20"],
    [["spend", "steps", "digest"], "0.70"],
    [["spend", "steps", "downgrade"], true],
    [["spend", "steps", "pause"], "1.00"],
    [["privacy", "frontier_allowed"], "2-Orchard/**"],
    [["privacy", "frontier_allowed"], [1]],
    [["tracking", "rhythm", "short"], [25]],
    [
      ["tracking", "rhythm", "short"],
      [25, 5, 5],
    ],
    [
      ["tracking", "rhythm", "long"],
      [45.5, 10],
    ],
    [["tracking", "rhythm", "long_break"], "20-30"],
    [
      ["tracking", "rhythm", "long_break_every"],
      [3, "4"],
    ],
    [["tracking", "estimate_padding"], "0.5"],
  ])("refuses %j set to %j", (path, value) => {
    expect(Config.safeParse(withValue(path, value)).success).toBe(false);
  });

  it("accepts either transcription engine in either position", () => {
    const swapped = withValue(["models", "transcription", "primary", "kind"], "whisper");
    expect(Config.safeParse(swapped).success).toBe(true);
  });

  it("accepts fractional spend values and padding", () => {
    expect(Config.safeParse(withValue(["spend", "monthly_cap_usd"], 12.5)).success).toBe(true);
    expect(Config.safeParse(withValue(["tracking", "estimate_padding"], 0.25)).success).toBe(true);
  });
});
