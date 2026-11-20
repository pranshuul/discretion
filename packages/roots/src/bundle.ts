import { readFileSync } from "node:fs";
import ts from "typescript";
import { shippedSnippets } from "./assets.js";

/** The sources the bundle is built from: everything `launch.ts` needs, and nothing that reads files. */
const sources = [
  "dates",
  "diff",
  "errors",
  "fill",
  "frontmatter",
  "kinds",
  "launch",
  "queries",
  "render",
  "repair",
] as const;

function transpile(name: string): string {
  const file = new URL(`../src/${name}.ts`, import.meta.url);
  return ts.transpileModule(readFileSync(file, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      newLine: ts.NewLineKind.LineFeed,
    },
    fileName: `${name}.ts`,
  }).outputText;
}

/** The CommonJS text of `_roots/scripts/roots.js`, built from the renderer's sources. */
export function buildBundle(): string {
  const modules = sources.map(
    (name) =>
      `    ${JSON.stringify(name)}: function (exports, require) {\n${transpile(name)}    },`,
  );
  return [
    '"use strict";',
    "// Roots' renderer for Templater, built from packages/roots/src by `pnpm --filter @discretion/roots bundle`.",
    "// Do not edit: install replaces this file.",
    "(function () {",
    "  var outer = typeof require === 'function' ? require : function (name) {",
    "    throw new Error('Cannot find module ' + name);",
    "  };",
    "  var definitions = {",
    ...modules,
    "  };",
    "  var loaded = {};",
    "  function load(name) {",
    "    if (!loaded[name]) {",
    "      var module = { exports: {} };",
    "      loaded[name] = module;",
    "      definitions[name](module.exports, function (request) {",
    "        var local = /^\\.\\/([a-z-]+)\\.js$/.exec(request);",
    "        return local && definitions[local[1]] ? load(local[1]) : outer(request);",
    "      });",
    "    }",
    "    return loaded[name].exports;",
    "  }",
    `  module.exports = load("launch").createLauncher(${JSON.stringify(shippedSnippets())});`,
    "})();",
    "",
  ].join("\n");
}
