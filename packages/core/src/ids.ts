/* eslint-disable @typescript-eslint/no-unused-vars */
import type { Clock } from "./clock.js";

export const idPrefixes = [
  "cap",
  "act",
  "tsk",
  "gol",
  "rev",
  "sub",
  "run",
  "crd",
  "tap",
  "rem",
  "viw",
] as const;

export type IdPrefix = (typeof idPrefixes)[number];

/** Fills a buffer with random bytes. */
export type RandomBytes = (length: number) => Uint8Array;

/** A generated id: `<prefix>_<YYYYMMDD>_<6 lowercase base32>`. */
export function newId(_prefix: IdPrefix, _clock: Clock, _random?: RandomBytes): string {
  throw new Error("red");
}
