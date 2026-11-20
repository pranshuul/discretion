import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import {
  Action,
  Config,
  Event,
  Log,
  Runflow,
  checkSchemas,
  formats,
  renderSchemas,
  runSchemas,
} from "../src/index.js";
import { PluginsLock } from "../src/pluginslock.js";
import { RootsDaily } from "../src/roots.js";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const committed = join(root, "schemas");
const paths = [
  "action/1.json",
  "config/1.json",
  "event/1.json",
  "log/1.json",
  "plugins-lock/1.json",
  "roots/1.json",
  "runflow/1.json",
];

type Json = { [key: string]: Json } | Json[] | string | number | boolean | null;

function sorted(value: Json): Json {
  if (Array.isArray(value)) {
    return value.map(sorted);
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, sorted(value[key] as Json)]),
    );
  }
  return value;
}

function schema(path: string): Record<string, Json> {
  return JSON.parse(renderSchemas()[path] as string) as Record<string, Json>;
}

const scratch: string[] = [];

function scratchDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "discretion-schemas-"));
  scratch.push(dir);
  return dir;
}

function run(args: string[], dir: string): { code: number; lines: string[] } {
  const lines: string[] = [];
  const code = runSchemas(args, dir, (line) => lines.push(line));
  return { code, lines };
}

afterEach(() => {
  for (const dir of scratch.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("the frozen formats", () => {
  it("are the five phase 0 freezes and the two phase 1 freezes, by versioned name", () => {
    expect(formats()).toEqual({
      "action/1": Action,
      "config/1": Config,
      "event/1": Event,
      "log/1": Log,
      "plugins-lock/1": PluginsLock,
      "roots/1": RootsDaily,
      "runflow/1": Runflow,
    });
  });
});

describe("generated schemas", () => {
  it("has one file per format, at its versioned name", () => {
    expect(Object.keys(renderSchemas())).toEqual(paths);
  });

  it.each(paths)("%s is a JSON Schema titled with its format", (path) => {
    const generated = schema(path);
    expect(generated.$schema).toBe("http://json-schema.org/draft-07/schema#");
    expect(generated.title).toBe(path.replace(/\.json$/, ""));
  });

  it.each(paths)("%s is written with sorted keys and a final newline", (path) => {
    const text = renderSchemas()[path] as string;
    expect(text).toBe(`${JSON.stringify(sorted(JSON.parse(text) as Json), null, 2)}\n`);
  });

  it("is the same on every run", () => {
    expect(renderSchemas()).toEqual(renderSchemas());
  });

  it("refuses unknown keys and requires only the marker in config/1", () => {
    const config = schema("config/1.json");
    expect(config.type).toBe("object");
    expect(config.additionalProperties).toBe(false);
    expect(config.required).toEqual(["schema"]);
    const properties = config.properties as Record<string, Record<string, Json>>;
    expect(Object.keys(properties)).toEqual([
      "install",
      "models",
      "privacy",
      "relay",
      "schema",
      "spend",
      "telegram",
      "tracking",
      "vault",
    ]);
    expect(properties.schema?.const).toBe("config/1");
    for (const [name, table] of Object.entries(properties)) {
      if (name !== "schema") {
        expect(table.additionalProperties, name).toBe(false);
      }
    }
  });

  it("requires the event fields the plan does not call optional", () => {
    const event = schema("event/1.json");
    expect(event.additionalProperties).toBe(false);
    expect(event.required).toEqual(["seq", "ts", "type", "source", "data"]);
    expect(Object.keys(event.properties as Record<string, Json>)).toEqual([
      "capture_id",
      "data",
      "run_id",
      "seq",
      "source",
      "ts",
      "type",
    ]);
  });

  it("requires the log fields the plan does not call optional", () => {
    const log = schema("log/1.json");
    expect(log.additionalProperties).toBe(false);
    expect(log.required).toEqual(["ts", "level", "component", "msg"]);
    const properties = log.properties as Record<string, Record<string, Json>>;
    expect(properties.level?.enum).toEqual(["debug", "info", "warn", "error"]);
  });

  it("carries the floor rule in action/1", () => {
    const action = schema("action/1.json");
    const variants = action.anyOf as Record<string, Json>[];
    expect(variants).toHaveLength(2);
    const required = variants.map((variant) => variant.required);
    expect(required).toContainEqual(["id", "ts", "type", "target", "inverse", "floor"]);
    expect(required).toContainEqual([
      "id",
      "ts",
      "type",
      "target",
      "inverse",
      "floor",
      "confirmed_by",
    ]);
    for (const variant of variants) {
      expect(variant.additionalProperties).toBe(false);
    }
  });

  it("accepts nothing but the allowed keys in runflow/1 nodes", () => {
    const runflow = schema("runflow/1.json");
    expect(runflow.additionalProperties).toBe(false);
    expect(runflow.required).toEqual(["workflow", "nodes"]);
    const text = renderSchemas()["runflow/1.json"] as string;
    const keys = new Set<string>();
    const nodes = (runflow.properties as Record<string, Record<string, Json>>).nodes;
    const kinds = (nodes?.additionalProperties as Record<string, Json>).anyOf as Record<
      string,
      Json
    >[];
    for (const kind of kinds) {
      expect(kind.additionalProperties).toBe(false);
      for (const key of Object.keys(kind.properties as Record<string, Json>)) {
        keys.add(key);
      }
    }
    expect([...keys].sort()).toEqual([
      "capabilities",
      "exit",
      "kind",
      "max_attempts",
      "on",
      "outcome",
      "run",
      "timeout",
    ]);
    expect(text).toContain('"vault.write"');
  });
});

describe("committed schemas", () => {
  it("match the generated ones", () => {
    expect(checkSchemas(committed)).toEqual([]);
  });

  it("are checked by the model package's schemas:check script", () => {
    const result = spawnSync("pnpm", ["--filter", "@discretion/model", "run", "schemas:check"], {
      cwd: root,
      encoding: "utf8",
    });
    expect(result.status, result.stdout + result.stderr).toBe(0);
  });

  it("are checked by the root schemas:check command", () => {
    const result = spawnSync("pnpm", ["schemas:check"], { cwd: root, encoding: "utf8" });
    expect(result.status, result.stdout + result.stderr).toBe(0);
    expect(result.stdout).toContain("schemas are up to date");
  });
});

describe("schema generation and check", () => {
  it("writes every schema, creating the directory", () => {
    const dir = join(scratchDir(), "schemas");
    expect(run([], dir).code).toBe(0);
    for (const path of paths) {
      expect(readFileSync(join(dir, path), "utf8")).toBe(renderSchemas()[path]);
    }
    expect(readdirSync(dir).sort()).toEqual([
      "action",
      "config",
      "event",
      "log",
      "plugins-lock",
      "roots",
      "runflow",
    ]);
  });

  it("passes the check on freshly written schemas", () => {
    const dir = scratchDir();
    run([], dir);
    expect(checkSchemas(dir)).toEqual([]);
    expect(run(["--check"], dir)).toEqual({ code: 0, lines: ["schemas are up to date"] });
  });

  it("fails the check on a changed schema and names it", () => {
    const dir = scratchDir();
    run([], dir);
    writeFileSync(join(dir, "event/1.json"), "{}\n");
    expect(checkSchemas(dir)).toEqual(["event/1.json"]);
    const result = run(["--check"], dir);
    expect(result.code).toBe(1);
    expect(result.lines.join("\n")).toContain("event/1.json");
  });

  it("fails the check on a missing schema", () => {
    const dir = scratchDir();
    run([], dir);
    rmSync(join(dir, "log/1.json"));
    expect(checkSchemas(dir)).toEqual(["log/1.json"]);
    expect(run(["--check"], dir).code).toBe(1);
  });

  it("fails the check on a schema no format generates", () => {
    const dir = scratchDir();
    run([], dir);
    mkdirSync(join(dir, "capture"));
    writeFileSync(join(dir, "capture/1.json"), "{}\n");
    expect(checkSchemas(dir)).toEqual(["capture/1.json"]);
    expect(run(["--check"], dir).code).toBe(1);
  });

  it("fails the check on a directory that does not exist", () => {
    const dir = join(scratchDir(), "absent");
    expect(checkSchemas(dir)).toEqual(paths);
    expect(run(["--check"], dir).code).toBe(1);
  });

  it("changes nothing when checking", () => {
    const dir = scratchDir();
    run([], dir);
    writeFileSync(join(dir, "event/1.json"), "{}\n");
    run(["--check"], dir);
    expect(readFileSync(join(dir, "event/1.json"), "utf8")).toBe("{}\n");
  });

  it("restores a drifted directory when generating again", () => {
    const dir = scratchDir();
    run([], dir);
    writeFileSync(join(dir, "event/1.json"), "{}\n");
    mkdirSync(join(dir, "capture"));
    writeFileSync(join(dir, "capture/1.json"), "{}\n");
    expect(run([], dir).code).toBe(0);
    expect(checkSchemas(dir)).toEqual([]);
  });

  it("refuses an argument it does not know", () => {
    const dir = scratchDir();
    expect(run(["--chekc"], dir).code).toBe(2);
    expect(readdirSync(dir)).toEqual([]);
  });
});
