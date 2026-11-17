import { z } from "zod";

/** RFC 3339 with an offset (`Z` or `±hh:mm`), as every timestamp on disk is stored. */
export const Timestamp = z.string().datetime({ offset: true });

/** The lowercase base32 alphabet of generated ids, as in the plan's own ids (`k3m9qa`). */
const base32 = "[0-9a-hjkmnp-tv-z]";

/** A generated id: `<prefix>_<YYYYMMDD>_<6 lowercase base32>`. */
export function generatedId(prefix: string): z.ZodString {
  return z.string().regex(new RegExp(`^${prefix}_[0-9]{8}_${base32}{6}$`));
}

/** The id of a capture, `cap_YYYYMMDD_xxxxxx`. */
export const CaptureId = generatedId("cap");

/** A type-specific object of named values. */
export const Fields = z.record(z.string(), z.unknown());
