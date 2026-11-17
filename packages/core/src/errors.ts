/** A refusal with a stable code, a human message and a remedy line. */
export class DiscretionError extends Error {
  readonly code: string;
  readonly remedy: string;

  /** `code` is `D` and four digits, the first naming the area, 1 to 7. */
  constructor(code: string, message: string, remedy: string) {
    if (!/^D[1-7][0-9]{3}$/.test(code)) {
      throw new TypeError(`Invalid error code ${code}: expected D1xxx to D7xxx`);
    }
    super(message);
    this.name = "DiscretionError";
    this.code = code;
    this.remedy = remedy;
  }

  /** `Dnnnn message` followed by the remedy line. */
  format(): string {
    return `${this.code} ${this.message}\nRemedy: ${this.remedy}`;
  }
}
