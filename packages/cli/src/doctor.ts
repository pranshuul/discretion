export type Status = "ok" | "warn" | "error";

export interface Finding {
  check: "config" | "secrets" | "ollama" | "tailscale" | "root-encryption";
  status: Status;
  message: string;
  remedy?: string;
}

export interface DoctorOptions {
  /** Path of `discretion.toml`. */
  configPath: string;
  /** Environment for the child processes (`sops`, `tailscale`, `findmnt`, `lsblk`). */
  env: NodeJS.ProcessEnv;
}

/** Runs every check and returns one finding per check, in a fixed order. */
export function runDoctor(options: DoctorOptions): Promise<Finding[]> {
  void options;
  throw new Error("red");
}

/** Text for people: one line per finding, the remedy on the next line. */
export function formatFindings(findings: Finding[]): string {
  void findings;
  throw new Error("red");
}
