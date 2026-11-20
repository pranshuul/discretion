// Writes assets/scripts/roots.js from the renderer's sources. Run after tsc -b.
import { writeFileSync } from "node:fs";
import { URL } from "node:url";
import { buildBundle } from "../dist/bundle.js";

writeFileSync(new URL("../assets/scripts/roots.js", import.meta.url), buildBundle());
