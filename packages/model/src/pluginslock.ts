import { z } from "zod";

const Sha256 = z.string().regex(/^[0-9a-f]{64}$/);

/** `plugins-lock/1`: `.discretion/plugins.lock.json`, the plugins install put in the vault. */
export const PluginsLock = z
  .object({
    schema: z.literal("plugins-lock/1"),
    /** Sorted by `id`. */
    plugins: z.array(
      z
        .object({
          /** The id in the plugin's `manifest.json`, which names its folder under `.obsidian/plugins/`. */
          id: z.string().min(1),
          name: z.string().min(1),
          /** `owner/name` of the official GitHub repository. */
          repo: z.string().regex(/^[^/\s]+\/[^/\s]+$/),
          version: z.string().min(1),
          /** File name to its SHA-256, as lowercase hex. */
          files: z.record(z.string().min(1), Sha256).refine((f) => Object.keys(f).length > 0),
        })
        .strict(),
    ),
  })
  .strict();

export type PluginsLock = z.infer<typeof PluginsLock>;
