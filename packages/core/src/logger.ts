import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { Log } from "@discretion/model";
import { today, timestamp, type Clock } from "./clock.js";
import { DiscretionError } from "./errors.js";
import { stableStringify } from "./json.js";

export type Level = "debug" | "info" | "warn" | "error";

export interface LogContext {
  capture_id?: string;
  run_id?: string;
  error?: unknown;
  fields?: Record<string, unknown>;
}

export interface LoggerOptions {
  /** The `logs/` directory; one `YYYY-MM-DD.jsonl` file per day. */
  dir: string;
  component: string;
  clock: Clock;
  /** Secret values that must never reach a line. */
  secrets?: readonly string[];
}

const replacement = "[redacted]";

function describe(error: unknown): Record<string, unknown> {
  if (error instanceof DiscretionError) {
    return { name: error.name, message: error.message, remedy: error.remedy };
  }
  if (error instanceof Error) {
    return { name: error.name, message: error.message };
  }
  return { message: String(error) };
}

/** Writes `log/1` lines to `<dir>/YYYY-MM-DD.jsonl`, the day read in Asia/Kolkata. */
export class Logger {
  readonly #options: LoggerOptions;
  /** Each secret as written in a JSON string and raw, longest first. */
  readonly #scrub: string[];

  constructor(options: LoggerOptions) {
    this.#options = options;
    const forms = (options.secrets ?? [])
      .filter((secret) => secret !== "")
      .flatMap((secret) => [JSON.stringify(secret).slice(1, -1), secret]);
    this.#scrub = [...new Set(forms)].sort((a, b) => b.length - a.length);
  }

  debug(msg: string, context?: LogContext): void {
    this.#write("debug", msg, context);
  }

  info(msg: string, context?: LogContext): void {
    this.#write("info", msg, context);
  }

  warn(msg: string, context?: LogContext): void {
    this.#write("warn", msg, context);
  }

  error(msg: string, context?: LogContext): void {
    this.#write("error", msg, context);
  }

  #write(level: Level, msg: string, context: LogContext = {}): void {
    const { clock, component, dir } = this.#options;
    const fields =
      context.error === undefined
        ? context.fields
        : { ...context.fields, error: describe(context.error) };
    const line = Log.parse({
      ts: timestamp(clock),
      level,
      component,
      msg,
      capture_id: context.capture_id,
      run_id: context.run_id,
      error_code: context.error instanceof DiscretionError ? context.error.code : undefined,
      fields,
    });
    let text = stableStringify(line);
    for (const secret of this.#scrub) {
      text = text.replaceAll(secret, replacement);
    }
    mkdirSync(dir, { recursive: true });
    appendFileSync(join(dir, `${today(clock)}.jsonl`), `${text}\n`);
  }
}
