/* eslint-disable @typescript-eslint/no-unused-vars */
import type { TemplateName } from "./assets.js";

/** The difference between a template in the vault and its shipped default; empty when equal. */
export async function templateDiff(_vault: string, _name: TemplateName): Promise<string> {
  throw new Error("red");
}

/** Restores a template to its shipped default; returns whether it changed. */
export async function templateReset(
  _vault: string,
  _name: TemplateName,
  _dryRun?: boolean,
): Promise<boolean> {
  throw new Error("red");
}
