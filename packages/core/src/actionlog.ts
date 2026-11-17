import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { Action } from "@discretion/model";
import { timestamp, type Clock } from "./clock.js";
import { newId } from "./ids.js";
import { stableStringify } from "./json.js";

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

export type NewAction = DistributiveOmit<Action, "id" | "ts">;

/** Appender for `actions.jsonl`. */
export class ActionLog {
  readonly #path: string;
  readonly #clock: Clock;

  constructor(path: string, clock: Clock) {
    this.#path = path;
    this.#clock = clock;
  }

  append(action: NewAction): Action {
    const written = Action.parse({
      ...action,
      id: newId("act", this.#clock),
      ts: timestamp(this.#clock),
    });
    mkdirSync(dirname(this.#path), { recursive: true });
    appendFileSync(this.#path, `${stableStringify(written)}\n`);
    return written;
  }
}
