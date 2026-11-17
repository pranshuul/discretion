import { fileURLToPath } from "node:url";
import { runSchemas } from "./schemas.js";

// Generates the repository's `schemas/`, or with `--check` fails when they differ.
const dir = fileURLToPath(new URL("../../../schemas", import.meta.url));
process.exitCode = runSchemas(process.argv.slice(2), dir, (line) => {
  console.log(line);
});
