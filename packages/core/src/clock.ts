/* eslint-disable @typescript-eslint/no-unused-vars */
/** The one source of time. Tests inject a fixed one. */
export interface Clock {
  now(): Date;
}

export const systemClock: Clock = {
  now() {
    throw new Error("red");
  },
};

/** RFC 3339 in Asia/Kolkata, with milliseconds and the +05:30 offset. */
export function timestamp(_clock: Clock): string {
  throw new Error("red");
}

/** The calendar date `YYYY-MM-DD` in Asia/Kolkata. */
export function today(_clock: Clock): string {
  throw new Error("red");
}
