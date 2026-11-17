import { describe, expect, it } from "vitest";
import { Action } from "../src/index.js";

const sha = (digit: string): string => digit.repeat(64);

function sample(): Record<string, unknown> {
  return {
    id: "act_20261105_k3m9qa",
    ts: "2026-11-05T09:41:00+05:30",
    capture_id: "cap_20261105_x2b8pd",
    run_id: "run_20261105_p7d2wn",
    type: "note.bullet.add",
    target: "1-Roots/01 Daily/2026/11-November/2026-11-05-Thursday.md",
    before_sha256: sha("a"),
    after_sha256: sha("b"),
    inverse: { patch: "@@ -1 +0,0 @@\n-- #idea x\n" },
    floor: false,
  };
}

const types = [
  "note.bullet.add",
  "note.section.write",
  "task.create",
  "task.update",
  "goal.update",
  "habit.mark",
  "habit.target.change",
  "reminder.set",
  "reminder.cancel",
  "plan.write",
  "review.add",
  "review.resolve",
  "canon.write",
  "reel.write",
  "card.write",
  "calendar.block.write",
  "mail.draft",
  "mail.send",
  "message.send",
];

describe("action/1", () => {
  it("accepts a file action", () => {
    expect(Action.safeParse(sample()).success).toBe(true);
  });

  it.each(types)("accepts the type %s under the floor", (type) => {
    const line = { ...sample(), type, floor: true, confirmed_by: "rev_20261105_a1b2c3" };
    expect(Action.safeParse(line).success).toBe(true);
  });

  it.each(["note.delete", "mail.read", ""])("refuses the type %j", (type) => {
    expect(Action.safeParse({ ...sample(), type }).success).toBe(false);
  });

  it.each(["id", "ts", "type", "target", "inverse", "floor"])(
    "refuses a line without %s",
    (field) => {
      const line = sample();
      Reflect.deleteProperty(line, field);
      expect(Action.safeParse(line).success).toBe(false);
    },
  );

  it("accepts a scheduled job's action, which has no capture or run", () => {
    const line = sample();
    delete line.capture_id;
    delete line.run_id;
    expect(Action.safeParse(line).success).toBe(true);
  });

  it("accepts an action that is not on a file, which has no hashes", () => {
    const line: Record<string, unknown> = {
      ...sample(),
      type: "reminder.set",
      target: "rem_20261105_a1b2c3",
    };
    delete line.before_sha256;
    delete line.after_sha256;
    expect(Action.safeParse(line).success).toBe(true);
  });

  it("refuses a floor action without its confirmation", () => {
    expect(Action.safeParse({ ...sample(), floor: true }).success).toBe(false);
  });

  it.each(["mail.send", "message.send"])("refuses %s outside the floor", (type) => {
    expect(Action.safeParse({ ...sample(), type, floor: false }).success).toBe(false);
  });

  it("accepts the time it was undone", () => {
    const line = { ...sample(), undone_at: "2026-11-05T09:45:00+05:30" };
    expect(Action.safeParse(line).success).toBe(true);
  });

  it.each<[string, unknown]>([
    ["id", "cap_20261105_k3m9qa"],
    ["id", "act_20261105_k3m9q"],
    ["id", "act_k3m9qa"],
    ["ts", "2026-11-05 09:41"],
    ["capture_id", "20261105"],
    ["run_id", 1],
    ["target", 1],
    ["before_sha256", "abc"],
    ["before_sha256", sha("A")],
    ["after_sha256", sha("g")],
    ["inverse", "git revert"],
    ["inverse", null],
    ["floor", "no"],
    ["confirmed_by", 1],
    ["undone_at", "yesterday"],
  ])("refuses %s set to %j", (field, value) => {
    expect(Action.safeParse({ ...sample(), [field]: value }).success).toBe(false);
  });

  it("refuses an unknown field", () => {
    expect(Action.safeParse({ ...sample(), surprise: 1 }).success).toBe(false);
    const floor = { ...sample(), floor: true, confirmed_by: "rev_20261105_a1b2c3", surprise: 1 };
    expect(Action.safeParse(floor).success).toBe(false);
  });
});
