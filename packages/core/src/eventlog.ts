import { appendFileSync, closeSync, fstatSync, mkdirSync, openSync, readSync } from "node:fs";
import { dirname } from "node:path";
import { Event } from "@discretion/model";
import { timestamp, type Clock } from "./clock.js";
import { stableStringify } from "./json.js";
import { withLock } from "./lock.js";

export type NewEvent = Omit<Event, "seq" | "ts">;

const chunk = 64 * 1024;
const newline = 0x0a;

/** The last line of a file, or `undefined` when it has none. */
function lastLine(path: string): string | undefined {
  let fd: number;
  try {
    fd = openSync(path, "r");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
  try {
    let start = fstatSync(fd).size;
    let tail = Buffer.alloc(0);
    while (start > 0) {
      const size = Math.min(chunk, start);
      start -= size;
      const block = Buffer.alloc(size);
      readSync(fd, block, 0, size, start);
      tail = Buffer.concat([block, tail]);
      let end = tail.length;
      while (end > 0 && tail[end - 1] === newline) {
        end -= 1;
      }
      const cut = end > 0 ? tail.lastIndexOf(newline, end - 1) : -1;
      if (end > 0 && (cut >= 0 || start === 0)) {
        return tail.subarray(cut + 1, end).toString("utf8");
      }
    }
    return undefined;
  } finally {
    closeSync(fd);
  }
}

/** Appender for `events.jsonl`; `seq` is gapless across processes. */
export class EventLog {
  readonly #path: string;
  readonly #clock: Clock;

  constructor(path: string, clock: Clock) {
    this.#path = path;
    this.#clock = clock;
  }

  append(event: NewEvent): Event {
    mkdirSync(dirname(this.#path), { recursive: true });
    return withLock(`${this.#path}.lock`, () => {
      const last = lastLine(this.#path);
      const seq = last === undefined ? 1 : Event.parse(JSON.parse(last)).seq + 1;
      const written = Event.parse({ ...event, seq, ts: timestamp(this.#clock) });
      appendFileSync(this.#path, `${stableStringify(written)}\n`);
      return written;
    });
  }
}
