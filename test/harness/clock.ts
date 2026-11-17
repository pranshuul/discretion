import type { Clock } from "@discretion/core";

/** A clock that only moves when a test moves it. */
export class FakeClock implements Clock {
  constructor(start: string | Date) {
    void start;
    throw new Error("red");
  }

  now(): Date {
    throw new Error("red");
  }

  /** Jumps to an instant. */
  set(to: string | Date): void {
    void to;
    throw new Error("red");
  }

  /** Moves forward by milliseconds; going backwards is refused. */
  advance(ms: number): void {
    void ms;
    throw new Error("red");
  }
}
