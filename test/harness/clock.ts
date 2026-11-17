import type { Clock } from "@discretion/core";

function instant(value: string | Date): number {
  const ms = new Date(value).getTime();
  if (Number.isNaN(ms)) {
    throw new RangeError(`FakeClock cannot read ${String(value)} as an instant`);
  }
  return ms;
}

/** A clock that only moves when a test moves it. */
export class FakeClock implements Clock {
  private ms: number;

  constructor(start: string | Date) {
    this.ms = instant(start);
  }

  now(): Date {
    return new Date(this.ms);
  }

  /** Jumps to an instant. */
  set(to: string | Date): void {
    this.ms = instant(to);
  }

  /** Moves forward by milliseconds; going backwards is refused. */
  advance(ms: number): void {
    if (!Number.isFinite(ms) || ms < 0) {
      throw new RangeError(`FakeClock can only advance by a non-negative number, not ${ms}`);
    }
    this.ms += ms;
  }
}
