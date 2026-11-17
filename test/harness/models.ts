export type Lane = "jev" | "ollama" | "frontier";

export interface ScenarioRule {
  lane: Lane;
  /** Every string must appear in the request body text. */
  contains?: string | string[];
  /** A string, or a JSON value. */
  reply: unknown;
  /** HTTP status; default 200. */
  status?: number;
  /** How many calls the rule answers; unlimited when absent. */
  times?: number;
  tokens?: { input: number; output: number };
}

export interface Scenario {
  rules: ScenarioRule[];
}

export interface ModelCall {
  lane: Lane;
  method: string;
  path: string;
  body: unknown;
  /** The index of the rule that answered, or null. */
  rule: number | null;
  status: number;
}

export function loadScenario(path: string): Scenario {
  void path;
  throw new Error("red");
}

/** Answers Jev, Ollama and frontier calls from a scenario. */
export class FakeModelServer {
  readonly calls: ModelCall[] = [];
  readonly url: string = "";

  static start(scenario: Scenario | string): Promise<FakeModelServer> {
    void scenario;
    throw new Error("red");
  }

  /** The Jev endpoint to configure. */
  get jevEndpoint(): string {
    throw new Error("red");
  }

  /** Calls no rule matched. */
  get unmatched(): ModelCall[] {
    throw new Error("red");
  }

  /** Rules with a `times` count that were not used up. */
  unused(): number[] {
    throw new Error("red");
  }

  close(): Promise<void> {
    throw new Error("red");
  }
}
