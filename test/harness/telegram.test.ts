import { Bot, GrammyError } from "grammy";
import { afterEach, describe, expect, it } from "vitest";
import { FakeClock } from "./clock.js";
import { until } from "./support.js";
import { FakeTelegram, type FakeTelegramOptions } from "./telegram.js";

const open: FakeTelegram[] = [];
const bots: Bot[] = [];

async function start(options?: FakeTelegramOptions) {
  const tg = await FakeTelegram.start(options);
  open.push(tg);
  return tg;
}

function botFor(tg: FakeTelegram, token = tg.token): Bot {
  const bot = new Bot(token, { client: { apiRoot: tg.apiRoot } });
  bots.push(bot);
  return bot;
}

afterEach(async () => {
  for (const bot of bots.splice(0)) {
    if (bot.isRunning()) {
      await bot.stop();
    }
  }
  for (const tg of open.splice(0)) {
    await tg.close();
  }
});

async function raw(tg: FakeTelegram, method: string, payload: object = {}, token = tg.token) {
  const response = await fetch(`${tg.apiRoot}/bot${token}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

describe("FakeTelegram", () => {
  it("answers getMe so grammY can initialise", async () => {
    const tg = await start();
    const bot = botFor(tg);
    await bot.init();
    expect(bot.botInfo.is_bot).toBe(true);
    expect(bot.botInfo.username).toBe("discretion_test_bot");
  });

  it("delivers a user's text to a grammY bot by long polling and records the reply", async () => {
    const tg = await start();
    const bot = botFor(tg);
    bot.on("message:text", (ctx) => ctx.reply(`got ${ctx.message.text}`));
    void bot.start();
    await until(() => bot.isRunning());
    const id = tg.say("hello");
    await until(() => tg.sent.length === 1);
    expect(id).toBe(1);
    expect(tg.sent[0]).toMatchObject({
      chatId: tg.ownerChatId,
      text: "got hello",
      edits: [],
      deleted: false,
    });
  });

  it("gives the message the owner's chat and user id", async () => {
    const tg = await start({ ownerChatId: 77 });
    expect(tg.ownerChatId).toBe(77);
    const bot = botFor(tg);
    const seen: Array<[number | undefined, number | undefined]> = [];
    bot.on("message", (ctx) => {
      seen.push([ctx.chat.id, ctx.from?.id]);
    });
    void bot.start();
    await until(() => bot.isRunning());
    tg.say("a");
    tg.say("b", { chatId: 99 });
    await until(() => seen.length === 2);
    expect(seen).toEqual([
      [77, 77],
      [99, 99],
    ]);
  });

  it("numbers messages per chat, user and bot messages alike", async () => {
    const tg = await start();
    expect(tg.say("one")).toBe(1);
    const reply = await botFor(tg).api.sendMessage(tg.ownerChatId, "reply");
    expect(reply.message_id).toBe(2);
    expect(tg.say("three")).toBe(3);
    expect(tg.say("elsewhere", { chatId: 5 })).toBe(1);
  });

  it("stamps messages with the fake clock", async () => {
    const clock = new FakeClock("2026-11-02T03:30:00Z");
    const tg = await start({ clock });
    const message = await botFor(tg).api.sendMessage(tg.ownerChatId, "hi");
    expect(message.date).toBe(Date.parse("2026-11-02T03:30:00Z") / 1000);
    clock.advance(60_000);
    const later = await botFor(tg).api.sendMessage(tg.ownerChatId, "hi again");
    expect(later.date).toBe(Date.parse("2026-11-02T03:31:00Z") / 1000);
  });

  it("records every call with its payload, including reply markup", async () => {
    const tg = await start();
    const markup = { inline_keyboard: [[{ text: "Keep", callback_data: "keep:1" }]] };
    await botFor(tg).api.sendMessage(tg.ownerChatId, "Keep it?", { reply_markup: markup });
    expect(tg.calls.map((call) => call.method)).toEqual(["sendMessage"]);
    expect(tg.calls[0]?.payload).toMatchObject({ chat_id: tg.ownerChatId, text: "Keep it?" });
    expect(tg.sent[0]?.replyMarkup).toEqual(markup);
  });

  it("delivers a button tap as a callback query and keeps edits", async () => {
    const tg = await start();
    const bot = botFor(tg);
    bot.on("callback_query:data", async (ctx) => {
      await ctx.answerCallbackQuery({ text: "ok" });
      await ctx.editMessageText(`chose ${ctx.callbackQuery.data}`);
    });
    const sent = await bot.api.sendMessage(tg.ownerChatId, "Pick", {
      reply_markup: { inline_keyboard: [[{ text: "A", callback_data: "a" }]] },
    });
    void bot.start();
    await until(() => bot.isRunning());
    tg.tap(sent.message_id, "a");
    await until(() => tg.sent[0]?.edits.length === 1);
    expect(tg.sent[0]).toMatchObject({ text: "chose a", edits: ["Pick"] });
    expect(tg.calls.map((call) => call.method)).toContain("answerCallbackQuery");
  });

  it("refuses a tap on a message the bot never sent", async () => {
    const tg = await start();
    expect(() => tg.tap(40, "a")).toThrow(/message 40/);
  });

  it("marks deleted messages", async () => {
    const tg = await start();
    const bot = botFor(tg);
    const sent = await bot.api.sendMessage(tg.ownerChatId, "gone soon");
    await bot.api.deleteMessage(tg.ownerChatId, sent.message_id);
    expect(tg.sent[0]).toMatchObject({ deleted: true, text: "gone soon" });
  });

  it("serves a voice note's bytes through getFile", async () => {
    const tg = await start();
    const bot = botFor(tg);
    const voice = new Uint8Array([79, 103, 103, 83, 0, 1, 2, 3]);
    let downloaded: Uint8Array | undefined;
    bot.on("message:voice", async (ctx) => {
      const file = await ctx.getFile();
      const response = await fetch(`${tg.apiRoot}/file/bot${tg.token}/${file.file_path}`);
      downloaded = new Uint8Array(await response.arrayBuffer());
      await ctx.reply(`voice ${ctx.message.voice.duration}`);
    });
    void bot.start();
    await until(() => bot.isRunning());
    tg.sayVoice(voice);
    await until(() => tg.sent.length === 1);
    expect(downloaded).toEqual(voice);
  });

  it("does not redeliver updates the bot has confirmed", async () => {
    const tg = await start();
    tg.say("first");
    const one = await raw(tg, "getUpdates", { timeout: 0 });
    const updates = one.body.result as Array<{ update_id: number }>;
    expect(updates).toHaveLength(1);
    const again = await raw(tg, "getUpdates", { timeout: 0 });
    expect((again.body.result as unknown[]).length).toBe(1);
    const confirmed = await raw(tg, "getUpdates", {
      offset: (updates[0] as { update_id: number }).update_id + 1,
      timeout: 0,
    });
    expect(confirmed.body.result).toEqual([]);
  });

  it("holds a long poll open until a message arrives", async () => {
    const tg = await start();
    const pending = raw(tg, "getUpdates", { timeout: 20 });
    setTimeout(() => tg.say("late"), 50);
    const result = await pending;
    expect(result.body.ok).toBe(true);
    expect(result.body.result).toHaveLength(1);
  });

  it("ends an empty long poll after its timeout", async () => {
    const tg = await start();
    const started = Date.now();
    const result = await raw(tg, "getUpdates", { timeout: 1 });
    expect(result.body).toEqual({ ok: true, result: [] });
    expect(Date.now() - started).toBeGreaterThanOrEqual(900);
  });

  it("releases pending polls when it closes", async () => {
    const tg = await FakeTelegram.start();
    const pending = raw(tg, "getUpdates", { timeout: 30 });
    await new Promise((resolve) => setTimeout(resolve, 50));
    await tg.close();
    const result = await pending;
    expect(result.body.result).toEqual([]);
  });

  it("rejects the wrong token with 401", async () => {
    const tg = await start({ token: "123456:right" });
    const wrong = await raw(tg, "getMe", {}, "123456:wrong");
    expect(wrong.status).toBe(401);
    expect(wrong.body).toMatchObject({ ok: false, error_code: 401 });
    await expect(botFor(tg, "123456:wrong").api.getMe()).rejects.toBeInstanceOf(GrammyError);
  });

  it("answers an unknown method with 404", async () => {
    const tg = await start();
    const result = await raw(tg, "launchRocket");
    expect(result.status).toBe(404);
    expect(result.body).toMatchObject({ ok: false, error_code: 404 });
  });

  it("accepts form-encoded payloads too", async () => {
    const tg = await start();
    const response = await fetch(`${tg.apiRoot}/bot${tg.token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ chat_id: String(tg.ownerChatId), text: "form" }),
    });
    expect(response.status).toBe(200);
    expect(tg.sent[0]?.text).toBe("form");
  });

  it("accepts the housekeeping calls grammY makes", async () => {
    const tg = await start();
    const api = botFor(tg).api;
    await api.deleteWebhook();
    await api.setMyCommands([{ command: "start", description: "Start" }]);
    await api.sendChatAction(tg.ownerChatId, "typing");
    const sent = await api.sendMessage(tg.ownerChatId, "pin me");
    await api.pinChatMessage(tg.ownerChatId, sent.message_id);
    expect(tg.calls.map((call) => call.method)).toEqual([
      "deleteWebhook",
      "setMyCommands",
      "sendChatAction",
      "sendMessage",
      "pinChatMessage",
    ]);
  });
});
