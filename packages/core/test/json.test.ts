import { describe, expect, it } from "vitest";
import { stableStringify } from "../src/json.js";

describe("stableStringify", () => {
  it("sorts keys at every depth and keeps list order", () => {
    expect(stableStringify({ b: 1, a: { d: [3, { z: 1, y: 2 }], c: null } })).toBe(
      '{"a":{"c":null,"d":[3,{"y":2,"z":1}]},"b":1}',
    );
  });

  it("drops undefined members like JSON does", () => {
    expect(stableStringify({ b: undefined, a: 1 })).toBe('{"a":1}');
  });

  it("writes scalars", () => {
    expect(stableStringify("x")).toBe('"x"');
    expect(stableStringify(3)).toBe("3");
  });
});
