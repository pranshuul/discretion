import {
  closeSync,
  linkSync,
  mkdirSync,
  openSync,
  readFileSync,
  unlinkSync,
  writeSync,
} from "node:fs";
import { dirname } from "node:path";

function sleep(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

function holder(path: string): number | undefined {
  try {
    const pid = Number.parseInt(readFileSync(path, "utf8"), 10);
    return Number.isInteger(pid) ? pid : undefined;
  } catch {
    return undefined;
  }
}

function remove(path: string): void {
  try {
    unlinkSync(path);
  } catch {
    // another process already removed it
  }
}

/**
 * Runs `work` holding the exclusive lock file `path`. The file is created whole, with the
 * owner's pid, by a hard link, so it is never seen half-written; a lock whose owner has
 * died is taken over.
 */
export function withLock<T>(path: string, work: () => T, timeoutMs = 30_000): T {
  mkdirSync(dirname(path), { recursive: true });
  const mine = `${path}.${process.pid}.tmp`;
  const fd = openSync(mine, "w");
  writeSync(fd, `${process.pid}\n`);
  closeSync(fd);
  const deadline = Date.now() + timeoutMs;
  try {
    for (;;) {
      try {
        linkSync(mine, path);
        break;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
          throw error;
        }
      }
      const pid = holder(path);
      if (pid !== undefined && !alive(pid)) {
        remove(path);
        continue;
      }
      if (Date.now() > deadline) {
        throw new Error(`Timed out waiting for the lock ${path}`);
      }
      sleep(2);
    }
  } finally {
    remove(mine);
  }
  try {
    return work();
  } finally {
    remove(path);
  }
}
