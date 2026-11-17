import { z } from "zod";
import { CaptureId, Fields, Timestamp } from "./common.js";

/** `event/1`: one line of `~/.local/state/discretion/events.jsonl`. */
export const Event = z
  .object({
    seq: z.number().int().min(1),
    ts: Timestamp,
    type: z.string(),
    source: z.string(),
    capture_id: CaptureId.optional(),
    run_id: z.string().optional(),
    data: Fields,
  })
  .strict();

export type Event = z.infer<typeof Event>;
