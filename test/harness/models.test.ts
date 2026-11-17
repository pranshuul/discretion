import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { FakeModelServer, loadScenario, type Scenario } from "./models.js";
import { scratch } from "./support.js";

const open: FakeModelServer[] = [];

async function start(scenario: Scenario | string): Promise<FakeModelServer> {
  const server = await FakeModelServer.start(scenario);
  open.push(server);
  return server;
}

afterEach(async () => {
  for (const server of open.splice(0)) {
    await server.close();
  }
});

async function post(url: string, body: unknown) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: response.status, text: await response.text(), headers: response.headers };
}

const chat = (prompt: string, stream?: boolean) => ({
  model: "qwen",
  messages: [{ role: "user", content: prompt }],
  ...(stream === undefined ? {} : { stream }),
});

describe("FakeModelServer: Ollama", () => {
  it("answers /api/chat in Ollama's shape", async () => {
    const server = await start({
      rules: [{ lane: "ollama", reply: "a title", tokens: { input: 12, output: 3 } }],
    });
    const result = await post(`${server.url}/api/chat`, chat("name this", false));
    expect(result.status).toBe(200);
    expect(JSON.parse(result.text)).toMatchObject({
      model: "qwen",
      message: { role: "assistant", content: "a title" },
      done: true,
      done_reason: "stop",
      prompt_eval_count: 12,
      eval_count: 3,
    });
  });

  it("streams NDJSON by default, as Ollama does", async () => {
    const server = await start({ rules: [{ lane: "ollama", reply: "streamed" }] });
    const result = await post(`${server.url}/api/chat`, chat("x"));
    const lines = result.text
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    expect(lines.length).toBeGreaterThanOrEqual(2);
    expect(lines.map((line) => line.message.content).join("")).toBe("streamed");
    expect(lines.at(-1)).toMatchObject({ done: true });
    expect(lines.slice(0, -1).every((line) => line.done === false)).toBe(true);
  });

  it("answers /api/generate", async () => {
    const server = await start({ rules: [{ lane: "ollama", reply: "text out" }] });
    const result = await post(`${server.url}/api/generate`, {
      model: "qwen",
      prompt: "p",
      stream: false,
    });
    expect(JSON.parse(result.text)).toMatchObject({ response: "text out", done: true });
  });

  it("answers /api/tags so a reachability check passes", async () => {
    const server = await start({ rules: [] });
    const response = await fetch(`${server.url}/api/tags`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ models: [] });
    expect(server.calls).toEqual([]);
  });

  it("serialises a JSON reply into the message text", async () => {
    const server = await start({
      rules: [{ lane: "ollama", reply: { label: "idea", confidence: 0.95 } }],
    });
    const result = await post(`${server.url}/api/chat`, chat("x", false));
    const content = (JSON.parse(result.text) as { message: { content: string } }).message.content;
    expect(JSON.parse(content)).toEqual({ label: "idea", confidence: 0.95 });
  });

  it("returns Ollama's error body for an error status", async () => {
    const server = await start({
      rules: [{ lane: "ollama", reply: "model not found", status: 404 }],
    });
    const result = await post(`${server.url}/api/chat`, chat("x", false));
    expect(result.status).toBe(404);
    expect(JSON.parse(result.text)).toEqual({ error: "model not found" });
  });
});

describe("FakeModelServer: frontier", () => {
  it("answers /v1/messages in the Messages API shape", async () => {
    const server = await start({
      rules: [{ lane: "frontier", reply: "a plan", tokens: { input: 40, output: 9 } }],
    });
    const result = await post(`${server.url}/v1/messages`, {
      model: "claude-sonnet-5-5",
      max_tokens: 100,
      messages: [{ role: "user", content: "plan my day" }],
    });
    expect(result.status).toBe(200);
    expect(JSON.parse(result.text)).toMatchObject({
      type: "message",
      role: "assistant",
      model: "claude-sonnet-5-5",
      content: [{ type: "text", text: "a plan" }],
      stop_reason: "end_turn",
      usage: { input_tokens: 40, output_tokens: 9 },
    });
  });

  it("returns the Messages API error body for an error status", async () => {
    const server = await start({ rules: [{ lane: "frontier", reply: "overloaded", status: 529 }] });
    const result = await post(`${server.url}/v1/messages`, { model: "m", messages: [] });
    expect(result.status).toBe(529);
    expect(JSON.parse(result.text)).toMatchObject({
      type: "error",
      error: { message: "overloaded" },
    });
  });
});

describe("FakeModelServer: Jev", () => {
  it("serves the scenario's reply verbatim under the Jev endpoint, whatever the path", async () => {
    const server = await start({
      rules: [{ lane: "jev", reply: { label: "task", confidence: 0.97 } }],
    });
    expect(server.jevEndpoint).toBe(`${server.url}/jev`);
    const result = await post(`${server.jevEndpoint}/anything/at/all`, { question: "classify" });
    expect(result.status).toBe(200);
    expect(result.headers.get("content-type")).toMatch(/application\/json/);
    expect(JSON.parse(result.text)).toEqual({ label: "task", confidence: 0.97 });
  });

  it("serves a string reply as it is", async () => {
    const server = await start({ rules: [{ lane: "jev", reply: "plain words" }] });
    const result = await post(`${server.jevEndpoint}/x`, {});
    expect(result.text).toBe("plain words");
  });

  it("serves an error status with the reply as its body", async () => {
    const server = await start({
      rules: [{ lane: "jev", reply: { error: "no credit" }, status: 402 }],
    });
    const result = await post(`${server.jevEndpoint}/x`, {});
    expect(result.status).toBe(402);
    expect(JSON.parse(result.text)).toEqual({ error: "no credit" });
  });
});

describe("FakeModelServer: matching", () => {
  it("matches a rule by lane", async () => {
    const server = await start({
      rules: [
        { lane: "jev", reply: "from jev" },
        { lane: "ollama", reply: "from ollama" },
      ],
    });
    const result = await post(`${server.url}/api/generate`, { prompt: "p", stream: false });
    expect(JSON.parse(result.text).response).toBe("from ollama");
    expect(server.calls[0]?.rule).toBe(1);
  });

  it("matches by a substring of the request body", async () => {
    const server = await start({
      rules: [
        { lane: "jev", contains: "buy milk", reply: "task" },
        { lane: "jev", contains: "great idea", reply: "idea" },
      ],
    });
    expect((await post(`${server.jevEndpoint}/c`, { text: "a great idea" })).text).toBe("idea");
    expect((await post(`${server.jevEndpoint}/c`, { text: "buy milk" })).text).toBe("task");
  });

  it("needs every string of a list", async () => {
    const server = await start({
      rules: [
        { lane: "jev", contains: ["alpha", "beta"], reply: "both" },
        { lane: "jev", reply: "fallback" },
      ],
    });
    expect((await post(`${server.jevEndpoint}/c`, { t: "alpha" })).text).toBe("fallback");
    expect((await post(`${server.jevEndpoint}/c`, { t: "alpha beta" })).text).toBe("both");
  });

  it("uses a counted rule up, then moves on to the next", async () => {
    const server = await start({
      rules: [
        { lane: "jev", reply: "first", times: 2 },
        { lane: "jev", reply: "after" },
      ],
    });
    const replies: string[] = [];
    for (let i = 0; i < 4; i++) {
      replies.push((await post(`${server.jevEndpoint}/c`, {})).text);
    }
    expect(replies).toEqual(["first", "first", "after", "after"]);
  });

  it("answers an uncounted rule without limit", async () => {
    const server = await start({ rules: [{ lane: "jev", reply: "again" }] });
    for (let i = 0; i < 5; i++) {
      expect((await post(`${server.jevEndpoint}/c`, {})).text).toBe("again");
    }
  });

  it("fails loudly when no rule matches, and records the call", async () => {
    const server = await start({ rules: [{ lane: "jev", contains: "x", reply: "y" }] });
    const result = await post(`${server.jevEndpoint}/c`, { t: "nothing here" });
    expect(result.status).toBe(500);
    expect(result.text).toMatch(/no scenario rule matches/);
    expect(server.unmatched).toHaveLength(1);
    expect(server.unmatched[0]).toMatchObject({ lane: "jev", rule: null, status: 500 });
  });

  it("records every call with its lane, method, path and parsed body", async () => {
    const server = await start({
      rules: [
        { lane: "ollama", reply: "o" },
        { lane: "frontier", reply: "f" },
      ],
    });
    await post(`${server.url}/api/chat`, chat("hello", false));
    await post(`${server.url}/v1/messages`, { model: "m", messages: [] });
    expect(
      server.calls.map((call) => [call.lane, call.method, call.path, call.rule, call.status]),
    ).toEqual([
      ["ollama", "POST", "/api/chat", 0, 200],
      ["frontier", "POST", "/v1/messages", 1, 200],
    ]);
    expect(server.calls[0]?.body).toEqual(chat("hello", false));
    expect(server.unmatched).toEqual([]);
  });

  it("lists counted rules that were not used up", async () => {
    const server = await start({
      rules: [
        { lane: "jev", reply: "a", times: 2 },
        { lane: "jev", contains: "never", reply: "b", times: 1 },
        { lane: "jev", contains: "never", reply: "c" },
      ],
    });
    await post(`${server.jevEndpoint}/c`, {});
    expect(server.unused()).toEqual([0, 1]);
    await post(`${server.jevEndpoint}/c`, {});
    expect(server.unused()).toEqual([1]);
  });

  it("answers 404 for a path that belongs to no lane", async () => {
    const server = await start({ rules: [] });
    const result = await post(`${server.url}/nowhere`, {});
    expect(result.status).toBe(404);
    expect(server.calls).toEqual([]);
  });
});

describe("scenario files", () => {
  const write = (content: string): string => {
    const path = join(scratch(), "scenario.json");
    writeFileSync(path, content);
    return path;
  };

  it("loads a JSON scenario file", () => {
    const path = write(JSON.stringify({ rules: [{ lane: "jev", reply: { a: 1 }, times: 1 }] }));
    expect(loadScenario(path)).toEqual({ rules: [{ lane: "jev", reply: { a: 1 }, times: 1 }] });
  });

  it("starts a server from a scenario file path", async () => {
    const path = write(JSON.stringify({ rules: [{ lane: "jev", reply: "from file" }] }));
    const server = await start(path);
    expect((await post(`${server.jevEndpoint}/c`, {})).text).toBe("from file");
  });

  it("refuses a file that is not JSON", () => {
    expect(() => loadScenario(write("{nope"))).toThrow(/scenario/i);
  });

  it("refuses an unknown lane, a missing reply and unknown keys", () => {
    expect(() =>
      loadScenario(write(JSON.stringify({ rules: [{ lane: "bing", reply: "x" }] }))),
    ).toThrow(/rules\.0\.lane/);
    expect(() => loadScenario(write(JSON.stringify({ rules: [{ lane: "jev" }] })))).toThrow(
      /rules\.0\.reply/,
    );
    expect(() =>
      loadScenario(write(JSON.stringify({ rules: [{ lane: "jev", reply: "x", extra: 1 }] }))),
    ).toThrow(/extra/);
    expect(() => loadScenario(write(JSON.stringify({ other: [] })))).toThrow(/scenario/i);
  });

  it("refuses a times count below one", () => {
    expect(() =>
      loadScenario(write(JSON.stringify({ rules: [{ lane: "jev", reply: "x", times: 0 }] }))),
    ).toThrow(/times/);
  });
});
