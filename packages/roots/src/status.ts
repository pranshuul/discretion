import type { PinnedPlugin } from "./pins.js";

function red(): never {
  throw new Error("red");
}

export interface StatusItem {
  kind: "plugin" | "lock" | "setting" | "template" | "file";
  name: string;
  /** `drift` is something to fix; `modified` is a file Pranshul edited on purpose. */
  severity: "drift" | "modified";
  message: string;
}

export interface StatusOptions {
  vault: string;
  plugins?: readonly PinnedPlugin[];
}

/** Everything in the vault that differs from what install would write. */
export async function status(options: StatusOptions): Promise<StatusItem[]> {
  return (
    red() && [
      { kind: "file" as const, name: options.vault, severity: "drift" as const, message: "" },
    ]
  );
}
