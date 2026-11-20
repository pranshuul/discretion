import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PluginsLock } from "@discretion/model";
import { shippedCss, shippedQuestions, shippedTemplate, templateNames } from "./assets.js";
import { sha256Of } from "./hash.js";
import { pinnedPlugins, type PinnedPlugin } from "./pins.js";
import { isRecord, readJson, rootsSettings } from "./settings.js";

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

const order: StatusItem["kind"][] = ["lock", "plugin", "setting", "template", "file"];

/** Everything in the vault that differs from what install would write. */
export async function status(options: StatusOptions): Promise<StatusItem[]> {
  const vault = options.vault;
  const plugins = options.plugins ?? pinnedPlugins;
  const items: StatusItem[] = [];
  const add = (
    kind: StatusItem["kind"],
    name: string,
    severity: StatusItem["severity"],
    message: string,
  ): void => {
    items.push({ kind, name, severity, message });
  };
  const text = (path: string): string | null =>
    existsSync(join(vault, path)) ? readFileSync(join(vault, path), "utf8") : null;

  // The lock against the pins.
  const lockPath = ".discretion/plugins.lock.json";
  const lockText = text(lockPath);
  if (lockText === null) {
    add("lock", "plugins.lock.json", "drift", "missing: run discretion roots install");
  } else {
    let lock: PluginsLock | null = null;
    try {
      lock = PluginsLock.parse(JSON.parse(lockText));
    } catch {
      add("lock", "plugins.lock.json", "drift", "is not a valid plugins-lock/1 file");
    }
    for (const pin of lock === null ? [] : plugins) {
      const entry = lock?.plugins.find((p) => p.id === pin.id);
      if (entry === undefined) {
        add("lock", pin.id, "drift", `${pin.name} is not in the lock`);
      } else if (entry.version !== pin.version) {
        add(
          "lock",
          pin.id,
          "drift",
          `the lock records ${entry.version} but ${pin.version} is pinned`,
        );
      } else if (JSON.stringify(sorted(entry.files)) !== JSON.stringify(sorted(pin.files))) {
        add("lock", pin.id, "drift", `the lock's hashes differ from the pin for ${pin.version}`);
      }
    }
  }

  // The plugin files against the pins.
  for (const pin of plugins) {
    for (const [file, expected] of Object.entries(pin.files)) {
      const path = `.obsidian/plugins/${pin.id}/${file}`;
      const bytes = existsSync(join(vault, path)) ? readFileSync(join(vault, path)) : null;
      if (bytes === null) {
        add("plugin", `${pin.id}/${file}`, "drift", `missing: ${path}`);
      } else if (sha256Of(bytes) !== expected) {
        add(
          "plugin",
          `${pin.id}/${file}`,
          "drift",
          `SHA-256 is ${sha256Of(bytes)}, ${pin.version} is pinned at ${expected}`,
        );
      }
    }
  }

  // The settings Roots needs.
  const setting = (name: string, ok: boolean, message: string): void => {
    if (!ok) add("setting", name, "drift", message);
  };
  const templater = readJson(vault, ".obsidian/plugins/templater-obsidian/data.json");
  const templaterSettings = isRecord(templater) ? templater : {};
  setting(
    "templater template folder",
    templaterSettings.templates_folder === rootsSettings.templatesFolder,
    `Templater's template folder should be ${rootsSettings.templatesFolder}`,
  );
  setting(
    "templater user-script folder",
    templaterSettings.user_scripts_folder === rootsSettings.userScriptsFolder,
    `Templater's user-script folder should be ${rootsSettings.userScriptsFolder}`,
  );
  const core = readJson(vault, ".obsidian/core-plugins.json");
  const coreOn = (id: string): boolean =>
    Array.isArray(core) ? core.includes(id) : isRecord(core) && core[id] === true;
  setting(
    "core Daily notes plugin",
    core !== undefined && !coreOn("daily-notes"),
    "the core Daily notes plugin should be off",
  );
  setting(
    "core File recovery plugin",
    coreOn("file-recovery"),
    "the core File recovery plugin should be on",
  );
  const appearance = readJson(vault, ".obsidian/appearance.json");
  const snippets = isRecord(appearance) ? appearance.enabledCssSnippets : undefined;
  setting(
    "roots CSS snippet",
    Array.isArray(snippets) && snippets.includes(rootsSettings.snippet),
    "the roots CSS snippet should be on",
  );
  const dataview = readJson(vault, ".obsidian/plugins/dataview/data.json");
  setting(
    "Dataview JavaScript queries",
    isRecord(dataview) &&
      dataview.enableDataviewJs === true &&
      dataview.enableInlineDataviewJs === true,
    "Dataview's JavaScript queries and inline JavaScript queries should be on",
  );
  const community = readJson(vault, ".obsidian/community-plugins.json");
  const missing = plugins
    .map((p) => p.id)
    .filter((id) => !(Array.isArray(community) && community.includes(id)));
  setting(
    "community plugins",
    missing.length === 0,
    `Obsidian is not set to load ${missing.join(", ")}`,
  );

  // Templates and the other files Roots owns the defaults of.
  const checkDefault = (
    kind: "template" | "file",
    name: string,
    path: string,
    shipped: string,
  ): void => {
    const current = text(path);
    if (current === null) add(kind, name, "drift", `missing: ${path}`);
    else if (current !== shipped) {
      add(kind, name, "modified", `differs from the shipped default (${path})`);
    }
  };
  for (const name of templateNames) {
    checkDefault(
      "template",
      name,
      `${rootsSettings.templatesFolder}/${name}.md`,
      shippedTemplate(name),
    );
  }
  checkDefault("file", "questions.md", "1-Roots/_roots/questions.md", shippedQuestions());
  checkDefault("file", "roots.css", "1-Roots/_roots/roots.css", shippedCss());
  const roots = text("1-Roots/_roots/roots.css");
  if (roots !== null && text(".obsidian/snippets/roots.css") !== roots) {
    add(
      "file",
      "roots.css snippet copy",
      "drift",
      ".obsidian/snippets/roots.css differs from _roots/roots.css: run discretion roots install",
    );
  }
  if (text("1-Roots/Roots.md") === null) {
    add("file", "Roots.md", "drift", "missing: 1-Roots/Roots.md");
  }

  return items.sort(
    (a, b) =>
      order.indexOf(a.kind) - order.indexOf(b.kind) ||
      (a.name < b.name ? -1 : a.name > b.name ? 1 : 0),
  );
}

function sorted(files: Readonly<Record<string, string>>): [string, string][] {
  return Object.entries(files).sort(([a], [b]) => (a < b ? -1 : 1));
}
