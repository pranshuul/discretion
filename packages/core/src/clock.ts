/** The one source of time. Tests inject a fixed one. */
export interface Clock {
  now(): Date;
}

export const systemClock: Clock = {
  now() {
    return new Date();
  },
};

/** Asia/Kolkata is UTC+05:30 all year. */
const offsetMinutes = 330;

function local(clock: Clock): string {
  return new Date(clock.now().getTime() + offsetMinutes * 60_000).toISOString();
}

/** RFC 3339 in Asia/Kolkata, with milliseconds and the +05:30 offset. */
export function timestamp(clock: Clock): string {
  return `${local(clock).slice(0, -1)}+05:30`;
}

/** The calendar date `YYYY-MM-DD` in Asia/Kolkata. */
export function today(clock: Clock): string {
  return local(clock).slice(0, 10);
}
