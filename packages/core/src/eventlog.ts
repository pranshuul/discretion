/* eslint-disable @typescript-eslint/no-unused-vars */
import type { Event } from "@discretion/model";
import type { Clock } from "./clock.js";

export type NewEvent = Omit<Event, "seq" | "ts">;

/** Appender for `events.jsonl`; `seq` is gapless across processes. */
export class EventLog {
  constructor(_path: string, _clock: Clock) {
    throw new Error("red");
  }
  append(_event: NewEvent): Event {
    throw new Error("red");
  }
}
