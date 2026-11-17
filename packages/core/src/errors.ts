/** A refusal with a stable code, a human message and a remedy line. */
export class DiscretionError extends Error {
  readonly code: string;
  readonly remedy: string;

  constructor(code: string, message: string, remedy: string) {
    super(message);
    this.code = code;
    this.remedy = remedy;
    throw new Error("red");
  }

  /** `Dnnnn message` followed by the remedy line. */
  format(): string {
    throw new Error("red");
  }
}
