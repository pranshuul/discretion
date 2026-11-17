import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach } from "vitest";

const made: string[] = [];

/** A scratch directory removed after each test. */
export function scratch(): string {
  const dir = mkdtempSync(join(tmpdir(), "discretion-core-"));
  made.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of made.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

/**
 * A stand-in `sops` on its own PATH directory. It records its arguments in `args.txt`
 * and prints `output`, exiting with `status`.
 */
export function fakeSops(output: string, status = 0): { env: NodeJS.ProcessEnv; args: string } {
  const dir = scratch();
  const bin = join(dir, "bin");
  mkdirSync(bin);
  const args = join(dir, "args.txt");
  const script = `#!/bin/sh\nprintf '%s\\n' "$@" > '${args}'\ncat <<'END'\n${output}\nEND\nexit ${status}\n`;
  writeFileSync(join(bin, "sops"), script);
  chmodSync(join(bin, "sops"), 0o755);
  return { env: { PATH: `${bin}:/usr/bin:/bin` }, args };
}
