import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { shippedTemplate, type TemplateName } from "./assets.js";
import { unifiedDiff } from "./diff.js";

export const templatesDir = "1-Roots/_roots/templates";

function current(vault: string, name: TemplateName): string | null {
  try {
    return readFileSync(join(vault, templatesDir, `${name}.md`), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

/** The difference between a template in the vault and its shipped default; empty when equal. */
export async function templateDiff(vault: string, name: TemplateName): Promise<string> {
  const shipped = shippedTemplate(name);
  const text = current(vault, name);
  if (text === shipped) return "";
  return unifiedDiff(shipped, text ?? "", `shipped ${name}.md`, `${templatesDir}/${name}.md`);
}

/** Restores a template to its shipped default; returns whether it changed. */
export async function templateReset(
  vault: string,
  name: TemplateName,
  dryRun = false,
): Promise<boolean> {
  const shipped = shippedTemplate(name);
  if (current(vault, name) === shipped) return false;
  if (!dryRun) {
    mkdirSync(join(vault, templatesDir), { recursive: true });
    writeFileSync(join(vault, templatesDir, `${name}.md`), shipped);
  }
  return true;
}
