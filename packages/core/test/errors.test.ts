import { describe, expect, it } from "vitest";
import { DiscretionError } from "../src/errors.js";

describe("typed errors", () => {
  it("carries a stable code, a message and a remedy", () => {
    const error = new DiscretionError("D6001", "Unknown key telegram.surprise.", "Remove the key.");
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("DiscretionError");
    expect(error.code).toBe("D6001");
    expect(error.message).toBe("Unknown key telegram.surprise.");
    expect(error.remedy).toBe("Remove the key.");
  });

  it("formats the code, the message and the remedy line", () => {
    const error = new DiscretionError(
      "D2014",
      "Cannot undo a sent mail.",
      "Write to the recipient.",
    );
    expect(error.format()).toBe("D2014 Cannot undo a sent mail.\nRemedy: Write to the recipient.");
  });

  it.each(["D0001", "D8001", "D601", "X6001", "d6001", "D60010"])(
    "refuses the malformed code %s",
    (code) => {
      expect(() => new DiscretionError(code, "m", "r")).toThrow(/code/);
    },
  );

  it.each(["D1001", "D2014", "D3005", "D4001", "D5001", "D6001", "D7001"])(
    "accepts the code %s",
    (code) => {
      expect(new DiscretionError(code, "m", "r").code).toBe(code);
    },
  );
});
