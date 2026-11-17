import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { startHarness } from "./harness.js";
import { scratch } from "./support.js";

// A two-node workflow: `classify` asks Jev and writes the label; `reply` tells the owner.
const classify = `
const input = JSON.parse(await (await import("node:fs/promises")).readFile(process.env.DISCRETION_INPUT, "utf8"));
const response = await fetch(input.jev + "/classify", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ text: input.text }),
});
const answer = await response.json();
await (await import("node:fs/promises")).writeFile(process.env.DISCRETION_RUN_DIR + "/label", answer.label);
console.log(JSON.stringify(answer));
`;

const reply = `
const fs = await import("node:fs/promises");
const input = JSON.parse(await fs.readFile(process.env.DISCRETION_INPUT, "utf8"));
const label = await fs.readFile(process.env.DISCRETION_RUN_DIR + "/label", "utf8");
const response = await fetch(input.telegram + "/bot" + input.token + "/sendMessage", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ chat_id: input.chat, text: "Filed as " + label }),
});
console.log(JSON.stringify(await response.json()));
`;

function fixture(): string {
  const dir = scratch();
  mkdirSync(join(dir, "workflows"));
  writeFileSync(join(dir, "classify.mjs"), classify);
  writeFileSync(join(dir, "reply.mjs"), reply);
  const node = JSON.stringify(process.execPath);
  writeFileSync(
    join(dir, "workflows", "fixture.toml"),
    `[workflow]
name = "fixture"
version = "0.1.0"
schema = "runflow/1"
start = "classify"

[nodes.classify]
kind = "script"
run = '${node} ${join(dir, "classify.mjs")}'
exit = { 0 = "ok" }
on = { ok = "reply" }

[nodes.reply]
kind = "script"
run = '${node} ${join(dir, "reply.mjs")}'
exit = { 0 = "ok" }
on = { ok = "done" }

[nodes.done]
kind = "end"
outcome = "filed"
`,
  );
  return dir;
}

describe("startHarness", () => {
  it("drives a two-node workflow through the runner with fake model, Telegram and clock", async () => {
    const harness = await startHarness({
      scenario: { rules: [{ lane: "jev", contains: "a great idea", reply: { label: "idea" } }] },
      now: "2026-11-02T03:30:00Z",
    });
    try {
      const dir = fixture();
      const input = join(dir, "input.json");
      writeFileSync(
        input,
        JSON.stringify({
          text: "a great idea about gardens",
          jev: harness.models.jevEndpoint,
          telegram: harness.telegram.apiRoot,
          token: harness.telegram.token,
          chat: harness.telegram.ownerChatId,
        }),
      );
      const result = await harness.run({ workflow: join(dir, "workflows", "fixture.toml"), input });
      expect(result.status).toBe("ended");
      expect(result.outcome).toBe("filed");
      expect(harness.models.calls.map((call) => call.lane)).toEqual(["jev"]);
      expect(harness.telegram.sent.map((message) => message.text)).toEqual(["Filed as idea"]);
      const events = readFileSync(join(harness.stateDir, "events.jsonl"), "utf8")
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line) as { type: string; ts: string });
      expect(events.map((event) => event.type)).toEqual(["run.started", "run.ended"]);
      expect(events[0]?.ts.startsWith("2026-11-02T09:00:00")).toBe(true);
    } finally {
      await harness.close();
    }
  });

  it("starts its servers from a scenario file path and shares one clock", async () => {
    const path = join(scratch(), "s.json");
    writeFileSync(path, JSON.stringify({ rules: [{ lane: "ollama", reply: "x" }] }));
    const harness = await startHarness({ scenario: path });
    try {
      expect(harness.models.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
      expect(harness.telegram.apiRoot).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
      harness.clock.advance(1000);
      const message = await fetch(
        `${harness.telegram.apiRoot}/bot${harness.telegram.token}/sendMessage`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ chat_id: harness.telegram.ownerChatId, text: "t" }),
        },
      );
      const body = (await message.json()) as { result: { date: number } };
      expect(body.result.date).toBe(Math.floor(harness.clock.now().getTime() / 1000));
    } finally {
      await harness.close();
    }
  });

  it("removes its scratch directory and stops its servers on close", async () => {
    const harness = await startHarness({ scenario: { rules: [] } });
    const { dir, models } = harness;
    writeFileSync(join(dir, "marker"), "x");
    await harness.close();
    expect(() => readFileSync(join(dir, "marker"))).toThrow();
    await expect(fetch(`${models.url}/api/tags`)).rejects.toThrow();
  });
});
