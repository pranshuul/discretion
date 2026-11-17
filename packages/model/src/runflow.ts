import { z } from "zod";

/** An exit code from 0 to 255, written as a TOML key. */
const ExitCode = z.string().regex(/^(0|[1-9][0-9]?|1[0-9]{2}|2[0-4][0-9]|25[0-5])$/);

/** A semantic version, as Admiral's `workflow/1` declares it. */
const SemVer = z
  .string()
  .regex(
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/,
  );

/** The only capabilities a node may declare. */
export const Capability = z.enum(["vault.write", "message.send", "mail.send", "network"]);

const Script = z
  .object({
    kind: z.literal("script"),
    run: z.string(),
    /** Seconds; the runner's default is 10 minutes. */
    timeout: z.number().int().positive().optional(),
    max_attempts: z.number().int().positive().optional(),
    exit: z.record(ExitCode, z.string()),
    on: z.record(z.string(), z.string()),
    capabilities: z.array(Capability).optional(),
  })
  .strict();

const End = z.object({ kind: z.literal("end"), outcome: z.string() }).strict();

/** `runflow/1`: `workflows/<name>.toml`, a strict subset of Admiral's `workflow/1`. */
export const Runflow = z
  .object({
    workflow: z
      .object({
        name: z.string(),
        version: SemVer,
        schema: z.literal("runflow/1"),
        start: z.string(),
      })
      .strict(),
    nodes: z.record(z.string(), z.union([Script, End])),
  })
  .strict();

export type Runflow = z.infer<typeof Runflow>;
