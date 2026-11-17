import { readFileSync } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { systemClock, type Clock } from "@discretion/core";
import { z } from "zod";

export type Lane = "jev" | "ollama" | "frontier";

const Rule = z
  .object({
    lane: z.enum(["jev", "ollama", "frontier"]),
    contains: z.union([z.string(), z.array(z.string())]).optional(),
    reply: z.unknown(),
    status: z.number().int().min(100).max(599).optional(),
    times: z.number().int().min(1).optional(),
    tokens: z
      .object({ input: z.number().int().min(0), output: z.number().int().min(0) })
      .strict()
      .optional(),
  })
  .strict()
  .superRefine((rule, context) => {
    if (!("reply" in rule)) {
      context.addIssue({ code: "custom", path: ["reply"], message: "Required" });
    }
  });

const ScenarioSchema = z.object({ rules: z.array(Rule) }).strict();

export interface ScenarioRule {
  lane: Lane;
  /** Every string must appear in the request body text. */
  contains?: string | string[];
  /** A string, or a JSON value. For `jev`, the `answers` object keyed by question name. */
  reply: unknown;
  /** HTTP status; default 200. */
  status?: number;
  /** How many calls the rule answers; unlimited when absent. */
  times?: number;
  tokens?: { input: number; output: number };
}

export interface Scenario {
  rules: ScenarioRule[];
}

export interface ModelCall {
  lane: Lane;
  method: string;
  path: string;
  body: unknown;
  /** The index of the rule that answered, or null. */
  rule: number | null;
  status: number;
}

function check(raw: unknown, source: string): Scenario {
  const result = ScenarioSchema.safeParse(raw);
  if (!result.success) {
    throw new Error(
      `Invalid scenario ${source}: ${result.error.issues
        .map((issue) => `${issue.path.join(".") || "(file)"}: ${issue.message}`)
        .join("; ")}`,
    );
  }
  return result.data as Scenario;
}

/** Reads and checks a JSON scenario file. */
export function loadScenario(path: string): Scenario {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new Error(`The scenario file ${path} is not readable JSON: ${(error as Error).message}`, {
      cause: error,
    });
  }
  return check(raw, path);
}

function laneOf(method: string, path: string): Lane | undefined {
  if (method === "POST" && /(^|\/)decisions$/.test(path)) {
    return "jev";
  }
  if (method === "POST" && (path === "/api/chat" || path === "/api/generate")) {
    return "ollama";
  }
  if (method === "POST" && path === "/v1/messages") {
    return "frontier";
  }
  return undefined;
}

function asText(reply: unknown): string {
  return typeof reply === "string" ? reply : JSON.stringify(reply);
}

/** Jev's request rules (decisions.md, 2026-11-18): a bearer key, a model, a state, 1+ questions. */
function refuseDecision(
  request: IncomingMessage,
  body: unknown,
): { status: number; message: string } | undefined {
  if (!/^Bearer\s+\S/.test(request.headers.authorization ?? "")) {
    return { status: 401, message: "missing bearer key" };
  }
  const asked = (typeof body === "object" && body !== null ? body : {}) as Record<string, unknown>;
  if (typeof asked.model !== "string" || asked.model === "") {
    return { status: 400, message: "model is required" };
  }
  if (asked.state === undefined || asked.state === null) {
    return { status: 400, message: "state is required" };
  }
  const questions = asked.questions;
  if (
    typeof questions !== "object" ||
    questions === null ||
    Array.isArray(questions) ||
    Object.keys(questions).length === 0
  ) {
    return { status: 400, message: "questions needs at least one key" };
  }
  return undefined;
}

async function readBody(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function send(response: ServerResponse, status: number, type: string, body: string): void {
  response.writeHead(status, { "content-type": type });
  response.end(body);
}

/** Answers Jev, Ollama and frontier calls from a scenario. */
export class FakeModelServer {
  readonly calls: ModelCall[] = [];
  readonly url: string;
  private readonly used: number[];

  private constructor(
    private readonly server: Server,
    private readonly scenario: Scenario,
    private readonly clock: Clock,
  ) {
    this.url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    this.used = scenario.rules.map(() => 0);
  }

  static async start(
    scenario: Scenario | string,
    options: { clock?: Clock } = {},
  ): Promise<FakeModelServer> {
    const loaded =
      typeof scenario === "string" ? loadScenario(scenario) : check(scenario, "(inline)");
    const server = createServer();
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const fake = new FakeModelServer(server, loaded, options.clock ?? systemClock);
    server.on("request", (request, response) => {
      void fake.handle(request, response);
    });
    return fake;
  }

  /** Calls no rule matched. */
  get unmatched(): ModelCall[] {
    return this.calls.filter((call) => call.rule === null);
  }

  /** Rules with a `times` count that were not used up. */
  unused(): number[] {
    return this.scenario.rules.flatMap((rule, i) =>
      rule.times !== undefined && (this.used[i] as number) < rule.times ? [i] : [],
    );
  }

  close(): Promise<void> {
    return new Promise((resolve) => {
      this.server.close(() => resolve());
      this.server.closeAllConnections();
    });
  }

  private match(lane: Lane, text: string): number | null {
    const index = this.scenario.rules.findIndex((rule, i) => {
      if (rule.lane !== lane) {
        return false;
      }
      if (rule.times !== undefined && (this.used[i] as number) >= rule.times) {
        return false;
      }
      const needles = rule.contains === undefined ? [] : [rule.contains].flat();
      return needles.every((needle) => text.includes(needle));
    });
    return index === -1 ? null : index;
  }

  private async handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const method = request.method ?? "GET";
    const path = new URL(request.url ?? "/", "http://fake").pathname;
    if (method === "GET" && path === "/api/tags") {
      send(response, 200, "application/json", JSON.stringify({ models: [] }));
      return;
    }
    const lane = laneOf(method, path);
    if (lane === undefined) {
      send(response, 404, "text/plain", `no such path ${path}`);
      return;
    }
    const text = await readBody(request);
    let body: unknown = text;
    try {
      body = JSON.parse(text);
    } catch {
      // A body that is not JSON is recorded as the text it was.
    }
    if (lane === "jev") {
      const refusal = refuseDecision(request, body);
      if (refusal !== undefined) {
        this.calls.push({ lane, method, path, body, rule: null, status: refusal.status });
        send(
          response,
          refusal.status,
          "application/json",
          JSON.stringify({ error: refusal.message }),
        );
        return;
      }
    }
    const rule = this.match(lane, text);
    if (rule === null) {
      this.calls.push({ lane, method, path, body, rule, status: 500 });
      send(response, 500, "text/plain", `no scenario rule matches this ${lane} call: ${text}`);
      return;
    }
    this.used[rule] = (this.used[rule] as number) + 1;
    const spec = this.scenario.rules[rule] as ScenarioRule;
    const status = spec.status ?? 200;
    this.calls.push({ lane, method, path, body, rule, status });
    this.answer(response, lane, path, body, spec, status);
  }

  private answer(
    response: ServerResponse,
    lane: Lane,
    path: string,
    body: unknown,
    spec: ScenarioRule,
    status: number,
  ): void {
    const asked = (body ?? {}) as { model?: string; stream?: boolean };
    const model = typeof asked.model === "string" ? asked.model : "";
    const answer = asText(spec.reply);
    const tokens = spec.tokens ?? { input: 0, output: 0 };
    if (lane === "jev") {
      const payload =
        status >= 400
          ? { error: answer }
          : {
              model,
              answers: spec.reply,
              usage: { input_tokens: tokens.input, output_tokens: tokens.output },
            };
      send(response, status, "application/json", JSON.stringify(payload));
      return;
    }
    if (lane === "frontier") {
      const payload =
        status >= 400
          ? { type: "error", error: { type: "api_error", message: answer } }
          : {
              id: "msg_fake",
              type: "message",
              role: "assistant",
              model,
              content: [{ type: "text", text: answer }],
              stop_reason: "end_turn",
              stop_sequence: null,
              usage: { input_tokens: tokens.input, output_tokens: tokens.output },
            };
      send(response, status, "application/json", JSON.stringify(payload));
      return;
    }
    if (status >= 400) {
      send(response, status, "application/json", JSON.stringify({ error: answer }));
      return;
    }
    const createdAt = this.clock.now().toISOString();
    const done = {
      model,
      created_at: createdAt,
      done: true,
      done_reason: "stop",
      prompt_eval_count: tokens.input,
      eval_count: tokens.output,
    };
    const generate = path === "/api/generate";
    const piece = (content: string, finished: boolean) => ({
      model,
      created_at: createdAt,
      ...(generate ? { response: content } : { message: { role: "assistant", content } }),
      done: finished,
      ...(finished ? done : {}),
    });
    if (asked.stream === false) {
      send(response, status, "application/json", JSON.stringify(piece(answer, true)));
      return;
    }
    const lines = [piece(answer, false), piece("", true)].map((line) => JSON.stringify(line));
    send(response, status, "application/x-ndjson", `${lines.join("\n")}\n`);
  }
}
