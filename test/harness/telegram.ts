import { systemClock, type Clock } from "@discretion/core";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

export interface ApiCall {
  method: string;
  payload: Record<string, unknown>;
}

export interface SentMessage {
  chatId: number;
  messageId: number;
  text: string;
  replyMarkup?: unknown;
  /** Texts the message held before each edit, oldest first. */
  edits: string[];
  deleted: boolean;
}

export interface FakeTelegramOptions {
  token?: string;
  clock?: Clock;
  /** Chat and user id of the owner; default 4242. */
  ownerChatId?: number;
}

type Payload = Record<string, unknown>;

interface Update {
  update_id: number;
  [key: string]: unknown;
}

interface Waiter {
  respond: () => void;
}

class ApiError extends Error {
  constructor(
    readonly code: number,
    description: string,
  ) {
    super(description);
  }
}

const defaultToken = "123456:fake-token";

/** A Telegram Bot API server for grammY's `apiRoot`. */
export class FakeTelegram {
  readonly token: string;
  readonly ownerChatId: number;
  /** Every call the bot made except `getUpdates`, which only polls. */
  readonly calls: ApiCall[] = [];
  readonly sent: SentMessage[] = [];

  private readonly clock: Clock;
  private readonly server: Server;
  private readonly root: string;
  private readonly updates: Update[] = [];
  private readonly waiters = new Set<Waiter>();
  private readonly counters = new Map<number, number>();
  private readonly files = new Map<string, { path: string; bytes: Uint8Array }>();
  private nextUpdate = 1;
  private nextFile = 1;

  private constructor(server: Server, options: FakeTelegramOptions) {
    this.server = server;
    this.token = options.token ?? defaultToken;
    this.ownerChatId = options.ownerChatId ?? 4242;
    this.clock = options.clock ?? systemClock;
    this.root = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  }

  static async start(options: FakeTelegramOptions = {}): Promise<FakeTelegram> {
    const server = createServer();
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const fake = new FakeTelegram(server, options);
    server.on("request", (request, response) => {
      void fake.handle(request, response);
    });
    return fake;
  }

  /** The value for grammY's `client.apiRoot`. */
  get apiRoot(): string {
    return this.root;
  }

  /** The user sends a text message; returns its message id. */
  say(text: string, from: { chatId?: number } = {}): number {
    const chat = from.chatId ?? this.ownerChatId;
    const command = /^\/[A-Za-z0-9_]+/.exec(text);
    const message = this.userMessage(chat, {
      text,
      ...(command === null
        ? {}
        : { entities: [{ type: "bot_command", offset: 0, length: command[0].length }] }),
    });
    this.push({ message });
    return message.message_id as number;
  }

  /** The user sends a voice note; returns its message id. */
  sayVoice(bytes: Uint8Array, from: { chatId?: number } = {}): number {
    const chat = from.chatId ?? this.ownerChatId;
    const n = this.nextFile++;
    const fileId = `voice_${n}`;
    this.files.set(fileId, { path: `voice/file_${n}.oga`, bytes });
    const message = this.userMessage(chat, {
      voice: {
        file_id: fileId,
        file_unique_id: `unique_${n}`,
        duration: 1,
        mime_type: "audio/ogg",
        file_size: bytes.length,
      },
    });
    this.push({ message });
    return message.message_id as number;
  }

  /** The user taps an inline button on a bot message. */
  tap(messageId: number, data: string, from: { chatId?: number } = {}): void {
    const chat = from.chatId ?? this.ownerChatId;
    const sent = this.sent.find((m) => m.chatId === chat && m.messageId === messageId);
    if (sent === undefined) {
      throw new Error(`The bot never sent message ${messageId} in chat ${chat}.`);
    }
    this.push({
      callback_query: {
        id: String(this.nextUpdate),
        from: this.user(chat),
        message: this.botMessage(sent),
        chat_instance: "fake",
        data,
      },
    });
  }

  close(): Promise<void> {
    return new Promise((resolve) => {
      this.server.close(() => resolve());
      for (const waiter of [...this.waiters]) {
        waiter.respond();
      }
      setTimeout(() => this.server.closeAllConnections(), 50).unref();
    });
  }

  private user(id: number) {
    return { id, is_bot: false, first_name: "Owner" };
  }

  private bot() {
    return {
      id: Number.parseInt(this.token, 10),
      is_bot: true,
      first_name: "Discretion Test",
      username: "discretion_test_bot",
      can_join_groups: true,
      can_read_all_group_messages: false,
      supports_inline_queries: false,
    };
  }

  private date(): number {
    return Math.floor(this.clock.now().getTime() / 1000);
  }

  private nextMessageId(chat: number): number {
    const id = (this.counters.get(chat) ?? 0) + 1;
    this.counters.set(chat, id);
    return id;
  }

  private userMessage(chat: number, content: Payload): Payload {
    return {
      message_id: this.nextMessageId(chat),
      from: this.user(chat),
      chat: { id: chat, type: "private", first_name: "Owner" },
      date: this.date(),
      ...content,
    };
  }

  private botMessage(sent: SentMessage): Payload {
    return {
      message_id: sent.messageId,
      from: this.bot(),
      chat: { id: sent.chatId, type: "private", first_name: "Owner" },
      date: this.date(),
      text: sent.text,
      ...(sent.replyMarkup === undefined ? {} : { reply_markup: sent.replyMarkup }),
    };
  }

  private push(update: Payload): void {
    this.updates.push({ update_id: this.nextUpdate++, ...update });
    for (const waiter of [...this.waiters]) {
      waiter.respond();
    }
  }

  private findSent(payload: Payload): SentMessage {
    const chat = Number(payload.chat_id);
    const id = Number(payload.message_id);
    const found = this.sent.find((m) => m.chatId === chat && m.messageId === id);
    if (found === undefined) {
      throw new ApiError(400, "Bad Request: message to edit not found");
    }
    return found;
  }

  private async getUpdates(payload: Payload): Promise<Update[]> {
    const offset = Number(payload.offset ?? 0);
    const limit = Number(payload.limit ?? 100);
    const timeout = Number(payload.timeout ?? 0);
    if (offset > 0) {
      this.updates.splice(
        0,
        this.updates.length,
        ...this.updates.filter((u) => u.update_id >= offset),
      );
    }
    if (this.updates.length === 0 && timeout > 0) {
      await new Promise<void>((resolve) => {
        const waiter: Waiter = {
          respond: () => {
            clearTimeout(timer);
            this.waiters.delete(waiter);
            resolve();
          },
        };
        const timer = setTimeout(waiter.respond, timeout * 1000);
        this.waiters.add(waiter);
      });
    }
    return this.updates.slice(0, limit);
  }

  private async call(method: string, payload: Payload): Promise<unknown> {
    if (method === "getUpdates") {
      return this.getUpdates(payload);
    }
    this.calls.push({ method, payload });
    switch (method) {
      case "getMe":
        return this.bot();
      case "deleteWebhook":
      case "setMyCommands":
      case "sendChatAction":
      case "answerCallbackQuery":
      case "pinChatMessage":
        return true;
      case "sendMessage": {
        const chatId = Number(payload.chat_id);
        const sent: SentMessage = {
          chatId,
          messageId: this.nextMessageId(chatId),
          text: String(payload.text ?? ""),
          edits: [],
          deleted: false,
          ...(payload.reply_markup === undefined
            ? {}
            : { replyMarkup: parseMarkup(payload.reply_markup) }),
        };
        this.sent.push(sent);
        return this.botMessage(sent);
      }
      case "editMessageText": {
        const sent = this.findSent(payload);
        sent.edits.push(sent.text);
        sent.text = String(payload.text ?? "");
        if (payload.reply_markup !== undefined) {
          sent.replyMarkup = parseMarkup(payload.reply_markup);
        }
        return this.botMessage(sent);
      }
      case "deleteMessage":
        this.findSent(payload).deleted = true;
        return true;
      case "getFile": {
        const file = this.files.get(String(payload.file_id));
        if (file === undefined) {
          throw new ApiError(400, "Bad Request: invalid file_id");
        }
        return {
          file_id: String(payload.file_id),
          file_unique_id: `unique_${String(payload.file_id)}`,
          file_size: file.bytes.length,
          file_path: file.path,
        };
      }
      default:
        throw new ApiError(404, "Not Found");
    }
  }

  private async handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const path = new URL(request.url ?? "/", "http://fake").pathname;
    const json = (status: number, body: unknown): void => {
      response.writeHead(status, { "content-type": "application/json" });
      response.end(JSON.stringify(body));
    };
    const fail = (code: number, description: string): void =>
      json(code, { ok: false, error_code: code, description });

    const download = /^\/file\/bot([^/]+)\/(.+)$/.exec(path);
    if (download !== null) {
      const file = [...this.files.values()].find((f) => f.path === download[2]);
      if (download[1] !== this.token) {
        fail(401, "Unauthorized");
      } else if (file === undefined) {
        fail(404, "Not Found");
      } else {
        response.writeHead(200, { "content-type": "application/octet-stream" });
        response.end(Buffer.from(file.bytes));
      }
      return;
    }
    const api = /^\/bot([^/]+)\/([A-Za-z]+)$/.exec(path);
    if (api === null) {
      fail(404, "Not Found");
      return;
    }
    if (api[1] !== this.token) {
      fail(401, "Unauthorized");
      return;
    }
    try {
      const payload = await readPayload(request);
      json(200, { ok: true, result: await this.call(api[2] as string, payload) });
    } catch (error) {
      if (error instanceof ApiError) {
        fail(error.code, error.message);
      } else {
        fail(400, `Bad Request: ${(error as Error).message}`);
      }
    }
  }
}

function parseMarkup(value: unknown): unknown {
  if (typeof value !== "string") {
    return value;
  }
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

async function readPayload(request: IncomingMessage): Promise<Payload> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(chunk as Buffer);
  }
  const text = Buffer.concat(chunks).toString("utf8");
  if (text === "") {
    return {};
  }
  const type = request.headers["content-type"] ?? "";
  if (type.includes("application/x-www-form-urlencoded")) {
    return Object.fromEntries(new URLSearchParams(text));
  }
  if (type.includes("application/json")) {
    return JSON.parse(text) as Payload;
  }
  throw new Error(`unsupported content type ${type}`);
}
