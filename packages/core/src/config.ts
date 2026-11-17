/* eslint-disable @typescript-eslint/no-unused-vars */
import type { Config } from "@discretion/model";

export interface LoadOptions {
  /** Environment for the `sops` child process; defaults to the current one. */
  env?: NodeJS.ProcessEnv;
}

export interface LoadedConfig {
  config: Config;
  /** Every resolved secret value, for the logger to scrub. */
  secrets: string[];
}

/** Reads `discretion.toml`, refuses unknown keys, resolves `secret:NAME` through `sops -d`. */
export function loadConfig(_path: string, _options?: LoadOptions): Promise<LoadedConfig> {
  throw new Error("red");
}
