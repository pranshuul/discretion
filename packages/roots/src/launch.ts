/* eslint-disable @typescript-eslint/no-unused-vars */
import type { Snippets } from "./render.js";

/** The parts of Templater's `tp` object the launcher uses. */
export interface TemplaterLike {
  [key: string]: unknown;
}

/** The function Templater calls as `tp.user.roots(tp)`. */
export function createLauncher(_snippets: Snippets): (tp: TemplaterLike) => Promise<string> {
  throw new Error("red");
}
