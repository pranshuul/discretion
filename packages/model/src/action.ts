import { z } from "zod";
import { CaptureId, Timestamp, generatedId } from "./common.js";

/** Actions that can never be undone; they always sit under the always-ask floor. */
const unconfirmable = ["mail.send", "message.send"] as const;

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
  ...unconfirmable,
] as const;

/** Every action type. */
export const ActionType = z.enum(types);

const Sha256 = z.string().regex(/^[0-9a-f]{64}$/);

function line<T extends z.ZodTypeAny>(type: T) {
  return {
    id: generatedId("act"),
    ts: Timestamp,
    capture_id: CaptureId.optional(),
    run_id: z.string().optional(),
    type,
    target: z.string(),
    before_sha256: Sha256.optional(),
    after_sha256: Sha256.optional(),
    /** Exactly how to undo: a patch, a record to delete, or an external call. */
    inverse: z.record(z.string(), z.unknown()),
  };
}

/** `action/1`: one line of `~/.local/state/discretion/actions.jsonl`. */
export const Action = z.union([
  z
    .object({
      ...line(ActionType.exclude([...unconfirmable])),
      floor: z.literal(false),
      undone_at: Timestamp.optional(),
    })
    .strict(),
  z
    .object({
      ...line(ActionType),
      floor: z.literal(true),
      /** The review item or Telegram confirmation that allowed it. */
      confirmed_by: z.string(),
      undone_at: Timestamp.optional(),
    })
    .strict(),
]);

export type Action = z.infer<typeof Action>;
