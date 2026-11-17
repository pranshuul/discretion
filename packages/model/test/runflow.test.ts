import { describe, expect, it } from "vitest";
import { Runflow } from "../src/index.js";

type Table = Record<string, unknown>;

// The build plan's capture-triage file, as its TOML parses: exit codes are keys, so strings.
function sample(): { workflow: Table; nodes: Record<string, Table> } {
  return {
    workflow: { name: "capture-triage", version: "0.1.0", schema: "runflow/1", start: "parse" },
    nodes: {
      parse: {
        kind: "script",
        run: "discretion-node capture.parse",
        exit: { "0": "ok", "1": "invalid" },
        on: { ok: "classify", invalid: "fail" },
      },
      classify: {
        kind: "script",
        run: "discretion-node capture.classify",
        max_attempts: 2,
        exit: { "0": "clear", "10": "vague" },
        on: { clear: "file", vague: "clarify" },
      },
      fail: { kind: "end", outcome: "failed" },
    },
  };
}

function withNode(node: string, change: Table, remove: string[] = []): unknown {
  const file = sample();
  const table = { ...file.nodes[node], ...change };
  for (const key of remove) {
    Reflect.deleteProperty(table, key);
  }
  file.nodes[node] = table;
  return file;
}

function withWorkflow(change: Table, remove: string[] = []): unknown {
  const file = sample();
  Object.assign(file.workflow, change);
  for (const key of remove) {
    Reflect.deleteProperty(file.workflow, key);
  }
  return file;
}

describe("runflow/1", () => {
  it("accepts the build plan's capture-triage file", () => {
    expect(Runflow.safeParse(sample()).success).toBe(true);
  });

  it("accepts a timeout and every capability on a script node", () => {
    const file = withNode("parse", {
      timeout: 600,
      capabilities: ["vault.write", "message.send", "mail.send", "network"],
    });
    expect(Runflow.safeParse(file).success).toBe(true);
  });

  it.each(["name", "version", "schema", "start"])("refuses a workflow without %s", (key) => {
    expect(Runflow.safeParse(withWorkflow({}, [key])).success).toBe(false);
  });

  it.each<[string, unknown]>([
    ["name", 1],
    ["version", 1],
    ["version", "1"],
    ["version", "0.1"],
    ["version", "v0.1.0"],
    ["schema", "workflow/1"],
    ["schema", "runflow/2"],
    ["start", 1],
    ["entry", "parse"],
    ["modes", ["headless"]],
  ])("refuses the workflow key %s set to %j", (key, value) => {
    expect(Runflow.safeParse(withWorkflow({ [key]: value })).success).toBe(false);
  });

  it("refuses a file without its workflow table or its nodes", () => {
    expect(Runflow.safeParse({ nodes: sample().nodes }).success).toBe(false);
    expect(Runflow.safeParse({ workflow: sample().workflow }).success).toBe(false);
  });

  it("refuses an unknown top-level table", () => {
    expect(Runflow.safeParse({ ...sample(), defaults: {} }).success).toBe(false);
  });

  it.each(["gate", "skill", "agent", "ask", "parallel", "sub-workflow", "deploy", 1])(
    "refuses the node kind %j",
    (kind) => {
      expect(Runflow.safeParse(withNode("parse", { kind })).success).toBe(false);
    },
  );

  it.each(["kind", "run", "exit", "on"])("refuses a script node without %s", (key) => {
    expect(Runflow.safeParse(withNode("parse", {}, [key])).success).toBe(false);
  });

  it("refuses an end node without its outcome", () => {
    expect(Runflow.safeParse(withNode("fail", {}, ["outcome"])).success).toBe(false);
  });

  it.each(["next", "id", "class", "output", "max_loops", "on_exhausted", "budget"])(
    "refuses the node key %s, which Admiral allows and the runner does not",
    (key) => {
      expect(Runflow.safeParse(withNode("parse", { [key]: "classify" })).success).toBe(false);
      expect(Runflow.safeParse(withNode("fail", { [key]: "classify" })).success).toBe(false);
    },
  );

  it.each<[string, unknown]>([
    ["run", "discretion-node capture.parse"],
    ["exit", { "0": "ok" }],
    ["on", { ok: "classify" }],
    ["max_attempts", 2],
    ["timeout", 600],
    ["capabilities", ["network"]],
  ])("refuses the script key %s on an end node", (key, value) => {
    expect(Runflow.safeParse(withNode("fail", { [key]: value })).success).toBe(false);
  });

  it("refuses an outcome on a script node", () => {
    expect(Runflow.safeParse(withNode("parse", { outcome: "failed" })).success).toBe(false);
  });

  it.each<[string, unknown]>([
    ["run", ["discretion-node", "capture.parse"]],
    ["timeout", 0],
    ["timeout", -5],
    ["timeout", 1.5],
    ["timeout", "10m"],
    ["max_attempts", 0],
    ["max_attempts", 1.5],
    ["max_attempts", "2"],
    ["exit", { ok: "ok" }],
    ["exit", { "-1": "ok" }],
    ["exit", { "256": "ok" }],
    ["exit", { "01": "ok" }],
    ["exit", { "1.5": "ok" }],
    ["exit", { "0": 0 }],
    ["exit", ["ok"]],
    ["on", { ok: 1 }],
    ["on", "classify"],
    ["capabilities", ["delete"]],
    ["capabilities", ["vault.write", "sudo"]],
    ["capabilities", "network"],
  ])("refuses the script key %s set to %j", (key, value) => {
    expect(Runflow.safeParse(withNode("parse", { [key]: value })).success).toBe(false);
  });

  it.each(["0", "1", "10", "99", "100", "199", "249", "255"])(
    "accepts the exit code %s",
    (code) => {
      expect(Runflow.safeParse(withNode("parse", { exit: { [code]: "ok" } })).success).toBe(true);
    },
  );

  it("refuses an end outcome that is not a name", () => {
    expect(Runflow.safeParse(withNode("fail", { outcome: 1 })).success).toBe(false);
  });
});
