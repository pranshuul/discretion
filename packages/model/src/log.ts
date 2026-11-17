import { z } from "zod";
import { CaptureId, Fields, Timestamp } from "./common.js";

/** `log/1`: one line of `~/.local/state/discretion/logs/YYYY-MM-DD.jsonl`. */
export const Log = z
  .object({
    ts: Timestamp,
    level: z.enum(["debug", "info", "warn", "error"]),
    component: z.string(),
    msg: z.string(),
    capture_id: CaptureId.optional(),
    run_id: z.string().optional(),
    /** A typed error's stable code, D1xxx to D7xxx. */
    error_code: z
      .string()
      .regex(/^D[1-7][0-9]{3}$/)
      .optional(),
    fields: Fields.optional(),
  })
  .strict();

export type Log = z.infer<typeof Log>;
