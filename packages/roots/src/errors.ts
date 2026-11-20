/** A refusal from the renderer: a stable code, a message and a remedy line. */
export class RootsError extends Error {
  readonly code: string;
  readonly remedy: string;

  constructor(code: string, message: string, remedy: string) {
    super(message);
    this.name = "RootsError";
    this.code = code;
    this.remedy = remedy;
  }
}
