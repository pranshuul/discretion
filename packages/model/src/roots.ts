import type { z } from "zod";

function red(): never {
  throw new Error("red");
}

/** `roots/1`: the frontmatter of a Roots daily note. */
export const RootsDaily: z.ZodTypeAny = red();
