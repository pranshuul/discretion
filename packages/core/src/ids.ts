import { randomBytes } from "node:crypto";
import { today, type Clock } from "./clock.js";

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

/** Lowercase base32 without `i`, `l`, `o` and `u`: 32 characters. */
const alphabet = "0123456789abcdefghjkmnpqrstvwxyz";

/** A generated id: `<prefix>_<YYYYMMDD>_<6 lowercase base32>`. */
export function newId(
  prefix: IdPrefix,
  clock: Clock,
  random: RandomBytes = (length) => randomBytes(length),
): string {
  if (!idPrefixes.includes(prefix)) {
    throw new TypeError(`Unknown id prefix ${prefix}`);
  }
  const suffix = Array.from(random(6), (byte) => alphabet[byte % 32]).join("");
  return `${prefix}_${today(clock).replaceAll("-", "")}_${suffix}`;
}
