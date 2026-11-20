import type { z } from "zod";

function red(): never {
  throw new Error("red");
}

/** `plugins-lock/1`: `.discretion/plugins.lock.json`. */
export const PluginsLock: z.ZodTypeAny = red();
