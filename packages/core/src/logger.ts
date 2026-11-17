/* eslint-disable @typescript-eslint/no-unused-vars */
import type { Clock } from "./clock.js";

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

export class Logger {
  constructor(_options: LoggerOptions) {
    throw new Error("red");
  }
  debug(_msg: string, _context?: LogContext): void {
    throw new Error("red");
  }
  info(_msg: string, _context?: LogContext): void {
    throw new Error("red");
  }
  warn(_msg: string, _context?: LogContext): void {
    throw new Error("red");
  }
  error(_msg: string, _context?: LogContext): void {
    throw new Error("red");
  }
}
