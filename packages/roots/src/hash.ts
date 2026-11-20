import { createHash } from "node:crypto";

/** The lowercase hex SHA-256 of `data`. */
export function sha256Of(data: Buffer | string): string {
  return createHash("sha256").update(data).digest("hex");
}
