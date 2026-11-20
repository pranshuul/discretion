import type { TemplateName } from "./assets.js";

function red(): never {
  throw new Error("red");
}

/** The difference between a template in the vault and its shipped default; empty when equal. */
export async function templateDiff(vault: string, name: TemplateName): Promise<string> {
  return red() && vault + name;
}

/** Restores a template to its shipped default; returns whether it changed. */
export async function templateReset(
  vault: string,
  name: TemplateName,
  dryRun = false,
): Promise<boolean> {
  return red() && vault + name + String(dryRun);
}
