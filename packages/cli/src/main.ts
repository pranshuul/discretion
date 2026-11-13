import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";

const usage = "Usage: discretion --version\n";

interface Output {
  write(text: string): unknown;
}

export function version(): string {
  const manifest = JSON.parse(
    readFileSync(new URL("../package.json", import.meta.url), "utf8"),
  ) as { version: string };
  return manifest.version;
}

/** Runs the `discretion` command and returns its exit code. */
export function run(argv: string[], stdout: Output, stderr: Output): number {
  let showVersion: boolean;
  try {
    const { values } = parseArgs({ args: argv, options: { version: { type: "boolean" } } });
    showVersion = values.version === true;
  } catch {
    showVersion = false;
  }
  if (!showVersion) {
    stderr.write(usage);
    return 2;
  }
  stdout.write(`${version()}\n`);
  return 0;
}
