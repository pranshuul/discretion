import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { startHarness } from "./harness/harness.js";
import { scratch } from "./harness/support.js";

// Gate: the harness drives a two-node fixture workflow through the runner with a fake capture.
// `fetch` reads the capture the owner sent to the fake bot and stores it; `file` answers the
// owner naming that capture.
const fetchNode = `
const fs = await import("node:fs/promises");
const input = JSON.parse(await fs.readFile(process.env.DISCRETION_INPUT, "utf8"));
const response = await fetch(input.telegram + "/bot" + input.token + "/getUpdates", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ timeout: 0 }),
});
const { result } = await response.json();
const text = result[0].message.text;
await fs.writeFile(process.env.DISCRETION_RUN_DIR + "/capture.txt", text);
console.log(JSON.stringify({ capture: process.env.DISCRETION_CAPTURE, text }));
`;

const fileNode = `
const fs = await import("node:fs/promises");
const input = JSON.parse(await fs.readFile(process.env.DISCRETION_INPUT, "utf8"));
const text = await fs.readFile(process.env.DISCRETION_RUN_DIR + "/capture.txt", "utf8");
await fetch(input.telegram + "/bot" + input.token + "/sendMessage", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ chat_id: input.chat, text: process.env.DISCRETION_CAPTURE + ": " + text }),
});
`;

describe("phase 0 gate", () => {
  it("drives a two-node fixture workflow through the runner with a fake capture", async () => {
    const capture = "cap_20261102_abc234";
    const harness = await startHarness({ scenario: { rules: [] }, now: "2026-11-02T03:30:00Z" });
    try {
      const dir = scratch();
      mkdirSync(join(dir, "workflows"));
      writeFileSync(join(dir, "fetch.mjs"), fetchNode);
      writeFileSync(join(dir, "file.mjs"), fileNode);
      const node = JSON.stringify(process.execPath);
      const workflow = join(dir, "workflows", "gate.toml");
      writeFileSync(
        workflow,
        `[workflow]
name = "gate"
version = "0.1.0"
schema = "runflow/1"
start = "fetch"

[nodes.fetch]
kind = "script"
run = '${node} ${join(dir, "fetch.mjs")}'
exit = { 0 = "ok" }
on = { ok = "file" }

[nodes.file]
kind = "script"
run = '${node} ${join(dir, "file.mjs")}'
exit = { 0 = "ok" }
on = { ok = "done" }

[nodes.done]
kind = "end"
outcome = "filed"
`,
      );
      const input = join(dir, "input.json");
      writeFileSync(
        input,
        JSON.stringify({
          capture_id: capture,
          telegram: harness.telegram.apiRoot,
          token: harness.telegram.token,
          chat: harness.telegram.ownerChatId,
        }),
      );
      harness.telegram.say("water the plants !18:00");
      const result = await harness.run({ workflow, input });
      expect(result.status).toBe("ended");
      expect(result.outcome).toBe("filed");
      expect(harness.telegram.sent.map((message) => message.text)).toEqual([
        `${capture}: water the plants !18:00`,
      ]);
      const events = readFileSync(join(harness.stateDir, "events.jsonl"), "utf8")
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line) as { seq: number; type: string; capture_id: string });
      expect(events.map((event) => [event.seq, event.type, event.capture_id])).toEqual([
        [1, "run.started", capture],
        [2, "run.ended", capture],
      ]);
    } finally {
      await harness.close();
    }
  });
});
