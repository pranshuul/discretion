/* eslint-disable @typescript-eslint/no-unused-vars */
import type { Action } from "@discretion/model";
import type { Clock } from "./clock.js";

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

export type NewAction = DistributiveOmit<Action, "id" | "ts">;

/** Appender for `actions.jsonl`. */
export class ActionLog {
  constructor(_path: string, _clock: Clock) {
    throw new Error("red");
  }
  append(_action: NewAction): Action {
    throw new Error("red");
  }
}
