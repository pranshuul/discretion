import type { Clock } from "@discretion/core";

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

/** A Telegram Bot API server for grammY's `apiRoot`. */
export class FakeTelegram {
  readonly token: string = "";
  readonly ownerChatId: number = 0;
  readonly calls: ApiCall[] = [];
  readonly sent: SentMessage[] = [];

  static start(options?: FakeTelegramOptions): Promise<FakeTelegram> {
    void options;
    throw new Error("red");
  }

  /** The value for grammY's `client.apiRoot`. */
  get apiRoot(): string {
    throw new Error("red");
  }

  /** The user sends a text message; returns its message id. */
  say(text: string, from?: { chatId?: number }): number {
    void text;
    void from;
    throw new Error("red");
  }

  /** The user sends a voice note; returns its message id. */
  sayVoice(bytes: Uint8Array, from?: { chatId?: number }): number {
    void bytes;
    void from;
    throw new Error("red");
  }

  /** The user taps an inline button on a bot message. */
  tap(messageId: number, data: string, from?: { chatId?: number }): void {
    void messageId;
    void data;
    void from;
    throw new Error("red");
  }

  close(): Promise<void> {
    throw new Error("red");
  }
}
