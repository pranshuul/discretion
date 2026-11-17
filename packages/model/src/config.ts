import { z } from "zod";

const Endpoint = z.object({ kind: z.enum(["phonon", "whisper"]), endpoint: z.string() }).strict();

/** A `[min, max]` or `[focus, break]` pair of whole minutes or blocks. */
const Pair = z.tuple([z.number().int(), z.number().int()]);

/** `config/1`: `~/.config/discretion/discretion.toml`. Unknown keys are refused. */
export const Config = z
  .object({
    schema: z.literal("config/1"),
    install: z
      .object({
        timezone: z.string(),
        profiles: z
          .object({ vps: z.boolean(), always_on: z.boolean(), gpu_node: z.boolean() })
          .partial()
          .strict(),
      })
      .partial()
      .strict(),
    vault: z.object({ path: z.string(), idle_commit_minutes: z.number().int() }).partial().strict(),
    telegram: z
      .object({ bot_token: z.string(), owner_chat_id: z.number().int() })
      .partial()
      .strict(),
    relay: z.object({ url: z.string(), token: z.string() }).partial().strict(),
    models: z
      .object({
        jev: z
          .object({
            endpoint: z.string(),
            model: z.string(),
            api_key: z.string(),
            max_input_tokens: z.number().int(),
          })
          .partial()
          .strict(),
        local: z
          .object({ endpoint: z.string(), filing_model: z.string(), librarian_model: z.string() })
          .partial()
          .strict(),
        transcription: z.object({ primary: Endpoint, fallback: Endpoint }).partial().strict(),
        lanes: z
          .object({ workhorse: z.string(), heavy: z.string(), cheap_api: z.string() })
          .partial()
          .strict(),
      })
      .partial()
      .strict(),
    spend: z
      .object({
        monthly_cap_usd: z.number(),
        steps: z
          .object({ digest: z.number(), downgrade: z.number(), pause: z.number() })
          .partial()
          .strict(),
      })
      .partial()
      .strict(),
    privacy: z
      .object({ frontier_allowed: z.array(z.string()) })
      .partial()
      .strict(),
    tracking: z
      .object({
        rhythm: z
          .object({ short: Pair, long: Pair, long_break: Pair, long_break_every: Pair })
          .partial()
          .strict(),
        estimate_padding: z.number(),
      })
      .partial()
      .strict(),
  })
  .partial()
  .required({ schema: true })
  .strict();

export type Config = z.infer<typeof Config>;
