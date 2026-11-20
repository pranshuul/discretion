import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { DiscretionError, systemClock, today } from "@discretion/core";
import {
  launcherNames,
  launcherText,
  shippedAgents,
  shippedBundle,
  shippedCss,
  shippedQuestions,
  shippedSnippets,
  shippedTemplate,
  templateNames,
} from "./assets.js";
import { sha256Of as sha256 } from "./hash.js";
import { pinnedPlugins, releaseUrl, type PinnedPlugin } from "./pins.js";
import { render } from "./render.js";
import {
  bindingKey,
  commandId,
  describeKey,
  isBinding,
  isRecord,
  launcherPath,
  modifiersFor,
  readJson,
  rootsSettings,
  type Binding,
} from "./settings.js";

export interface InstallOptions {
  vault: string;
  dryRun?: boolean;
  /** Replaces `fetch` for the plugin downloads. */
  fetch?: typeof fetch;
  /** Where releases are downloaded from; `https://github.com` by default. */
  githubBase?: string;
  /** Replaces the pinned plugin list. */
  plugins?: readonly PinnedPlugin[];
  /** Picks the hotkey modifiers; the running platform by default. */
  platform?: NodeJS.Platform;
}

export interface InstallResult {
  /**
   * What was done, or with `dryRun` what would be. Empty when everything is in place. A line
   * starting `note: ` is something to tell the user, such as a hotkey that was already taken.
   */
  changes: string[];
}

const layout = [
  "1-Roots/Daily",
  "1-Roots/Weekly",
  "1-Roots/Monthly",
  "1-Roots/Quarterly",
  "1-Roots/Yearly",
  "1-Roots/_roots/templates",
  "1-Roots/_roots/launchers",
  "1-Roots/_roots/scripts",
];

const agentsPath = `${rootsSettings.templatesFolder}/AGENTS.md`;
const agentsLink = `[Rules for editing the Roots templates](${agentsPath})`;

const sortedKeys = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(sortedKeys);
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, sortedKeys(value[key])]),
    );
  }
  return value;
};

/** `.discretion/plugins.lock.json` for `plugins`, sorted by id. */
export function lockText(plugins: readonly PinnedPlugin[]): string {
  const lock = {
    schema: "plugins-lock/1",
    plugins: [...plugins]
      .sort((a, b) => (a.id < b.id ? -1 : 1))
      .map(({ id, name, repo, version, files }) => ({ id, name, repo, version, files })),
  };
  return `${JSON.stringify(sortedKeys(lock), null, 2)}\n`;
}

interface Write {
  path: string;
  data: string | Buffer;
  description: string;
}

function refuseHash(plugin: PinnedPlugin, file: string, url: string, actual: string): never {
  throw new DiscretionError(
    "D2010",
    `${plugin.id} ${file} from ${url} has SHA-256 ${actual}, but the pinned ${plugin.version} release has ${plugin.files[file] ?? "no such file"}. Nothing was written.`,
    "Do not use the file. Check that the download was not altered, then run discretion roots install again; if the release itself changed, the pin must be reviewed and updated.",
  );
}

function refuseDownload(plugin: PinnedPlugin, file: string, url: string, why: string): never {
  throw new DiscretionError(
    "D2010",
    `Could not download ${plugin.id} ${file} from ${url}: ${why}, so its SHA-256 could not be checked. Nothing was written.`,
    "Check the network connection, then run discretion roots install again.",
  );
}

async function download(
  fetcher: typeof fetch,
  base: string,
  plugin: PinnedPlugin,
  file: string,
): Promise<Buffer> {
  const url = releaseUrl(base, plugin, file);
  let bytes: Buffer;
  try {
    const response = await fetcher(url);
    if (!response.ok) refuseDownload(plugin, file, url, `status ${response.status}`);
    bytes = Buffer.from(await response.arrayBuffer());
  } catch (error) {
    if (error instanceof DiscretionError) throw error;
    return refuseDownload(plugin, file, url, (error as Error).message);
  }
  const actual = sha256(bytes);
  if (actual !== plugin.files[file]) refuseHash(plugin, file, url, actual);
  return bytes;
}

const fileBytes = (vault: string, path: string): Buffer | null => {
  const file = join(vault, path);
  return existsSync(file) ? readFileSync(file) : null;
};

/** Lays out Roots in the vault and installs the pinned plugins. */
export async function install(options: InstallOptions): Promise<InstallResult> {
  const vault = resolve(options.vault);
  const plugins = [...(options.plugins ?? pinnedPlugins)].sort((a, b) => (a.id < b.id ? -1 : 1));
  const fetcher = options.fetch ?? fetch;
  const platform = options.platform ?? process.platform;
  const base = options.githubBase ?? "https://github.com";
  const writes: Write[] = [];
  const notices: string[] = [];
  const changes: string[] = [];
  const text = (path: string): string | null => fileBytes(vault, path)?.toString("utf8") ?? null;

  // Plugin files first: every download is checked before anything is written.
  for (const plugin of plugins) {
    for (const file of Object.keys(plugin.files).sort()) {
      const path = `.obsidian/plugins/${plugin.id}/${file}`;
      const onDisk = fileBytes(vault, path);
      if (onDisk !== null && sha256(onDisk) === plugin.files[file]) continue;
      changes.push(`download ${plugin.id} ${plugin.version} ${file}`);
      if (options.dryRun) {
        writes.push({ path, data: "", description: `write ${path}` });
      } else {
        writes.push({
          path,
          data: await download(fetcher, base, plugin, file),
          description: `write ${path}`,
        });
      }
    }
  }

  const dirs = layout.filter((dir) => !existsSync(join(vault, dir)));

  // Files Roots owns the defaults of: written once, never over an edit.
  const once = (path: string, data: string): void => {
    if (text(path) === null) writes.push({ path, data, description: `write ${path}` });
  };
  // Machinery: kept exactly as shipped, so a changed copy is written back.
  const exact = (path: string, data: string): void => {
    if (text(path) !== data) writes.push({ path, data, description: `write ${path}` });
  };
  for (const name of templateNames)
    once(`${rootsSettings.templatesFolder}/${name}.md`, shippedTemplate(name));
  once(agentsPath, shippedAgents());
  once("1-Roots/_roots/questions.md", shippedQuestions());
  once("1-Roots/_roots/roots.css", shippedCss());
  for (const name of launcherNames) exact(launcherPath(name), launcherText);
  exact(`${rootsSettings.userScriptsFolder}/roots.js`, shippedBundle());

  const homeTemplate = text(`${rootsSettings.templatesFolder}/home.md`) ?? shippedTemplate("home");
  once(
    "1-Roots/Roots.md",
    render("home", today(systemClock), {
      template: homeTemplate,
      questions: text("1-Roots/_roots/questions.md") ?? shippedQuestions(),
      snippets: shippedSnippets(),
    }),
  );

  // CLAUDE.md at the vault root links the contract for agents that edit the templates.
  const claude = text("CLAUDE.md");
  if (claude === null) {
    writes.push({ path: "CLAUDE.md", data: `${agentsLink}\n`, description: "write CLAUDE.md" });
  } else if (!claude.includes(agentsPath)) {
    const body = claude.replace(/\s+$/, "");
    writes.push({
      path: "CLAUDE.md",
      data: `${body}${body === "" ? "" : "\n\n"}${agentsLink}\n`,
      description: "update CLAUDE.md",
    });
  }

  // The CSS snippet is Obsidian's copy of _roots/roots.css.
  const css = text("1-Roots/_roots/roots.css") ?? shippedCss();
  if (text(".obsidian/snippets/roots.css") !== css) {
    writes.push({
      path: ".obsidian/snippets/roots.css",
      data: css,
      description: "write .obsidian/snippets/roots.css",
    });
  }

  // Settings: merged into what is there, keeping every key that is not Roots'.
  const merge = (path: string, build: (existing: unknown) => unknown): void => {
    const existing = readJson(vault, path);
    const next = build(existing);
    if (
      existing !== undefined &&
      JSON.stringify(sortedKeys(existing)) === JSON.stringify(sortedKeys(next))
    )
      return;
    writes.push({
      path,
      data: `${JSON.stringify(next, null, 2)}\n`,
      description: `${existing === undefined ? "write" : "update"} ${path}`,
    });
  };

  merge(".obsidian/core-plugins.json", (existing) => {
    if (Array.isArray(existing)) {
      const enabled = existing.filter((id) => id !== "daily-notes");
      return enabled.includes("file-recovery") ? enabled : [...enabled, "file-recovery"];
    }
    return { ...(isRecord(existing) ? existing : {}), "daily-notes": false, "file-recovery": true };
  });

  merge(".obsidian/community-plugins.json", (existing) => {
    const have = Array.isArray(existing) ? (existing as string[]) : [];
    const add = plugins.map((p) => p.id).filter((id) => !have.includes(id));
    return [...have, ...add];
  });

  merge(".obsidian/appearance.json", (existing) => {
    const settings = isRecord(existing) ? existing : {};
    const snippets = Array.isArray(settings.enabledCssSnippets)
      ? (settings.enabledCssSnippets as string[])
      : [];
    return {
      ...settings,
      enabledCssSnippets: snippets.includes(rootsSettings.snippet)
        ? snippets
        : [...snippets, rootsSettings.snippet],
    };
  });

  merge(".obsidian/plugins/dataview/data.json", (existing) => ({
    ...(isRecord(existing) ? existing : {}),
    enableDataviewJs: true,
    enableInlineDataviewJs: true,
  }));

  merge(".obsidian/plugins/templater-obsidian/data.json", (existing) => {
    const settings = isRecord(existing) ? existing : {};
    const listed = Array.isArray(settings.enabled_templates_hotkeys)
      ? (settings.enabled_templates_hotkeys as string[]).filter((p) => p !== "")
      : [];
    const hotkeyPaths = rootsSettings.hotkeyLaunchers.map((l) => launcherPath(l.name));
    const placed = new Set<string>();
    const folders = (Array.isArray(settings.folder_templates) ? settings.folder_templates : []).map(
      (entry: unknown) => {
        const ours = rootsSettings.folderTemplates.find(
          (f) => isRecord(entry) && entry.folder === f.folder,
        );
        if (ours === undefined) return entry;
        placed.add(ours.folder);
        return { ...ours };
      },
    ) as unknown[];
    for (const ours of rootsSettings.folderTemplates)
      if (!placed.has(ours.folder)) folders.push({ ...ours });
    return {
      ...settings,
      templates_folder: rootsSettings.launchersFolder,
      user_scripts_folder: rootsSettings.userScriptsFolder,
      enable_folder_templates: true,
      folder_templates: folders,
      enabled_templates_hotkeys: [...listed, ...hotkeyPaths.filter((p) => !listed.includes(p))],
    };
  });

  merge(".obsidian/hotkeys.json", (existing) => {
    const bound: Record<string, unknown> = isRecord(existing) ? { ...existing } : {};
    const taken = new Map<string, string>();
    for (const [command, bindings] of Object.entries(bound)) {
      if (Array.isArray(bindings)) {
        for (const b of bindings.filter(isBinding)) taken.set(bindingKey(platform, b), command);
      }
    }
    for (const launcher of rootsSettings.hotkeyLaunchers) {
      const id = commandId(launcher.name);
      if (id in bound) continue;
      const binding: Binding = { modifiers: modifiersFor(platform), key: launcher.key };
      const holder = taken.get(bindingKey(platform, binding));
      if (holder !== undefined) {
        notices.push(
          `note: ${describeKey(platform, launcher.key)} is already bound to ${holder}, so ${launcher.name}.md has no hotkey; it is still in the command palette as "Templater: Insert ${launcherPath(launcher.name)}". Bind a key to it under Settings, Hotkeys.`,
        );
        continue;
      }
      bound[id] = [binding];
      taken.set(bindingKey(platform, binding), id);
    }
    return bound;
  });

  const lock = lockText(plugins);
  if (text(".discretion/plugins.lock.json") !== lock) {
    const existed = text(".discretion/plugins.lock.json") !== null;
    writes.push({
      path: ".discretion/plugins.lock.json",
      data: lock,
      description: `${existed ? "update" : "write"} .discretion/plugins.lock.json`,
    });
  }

  for (const dir of dirs) changes.push(`create ${dir}`);
  for (const w of writes) changes.push(w.description);
  changes.push(...notices);
  if (!options.dryRun) {
    for (const dir of dirs) mkdirSync(join(vault, dir), { recursive: true });
    for (const w of writes) {
      mkdirSync(dirname(join(vault, w.path)), { recursive: true });
      writeFileSync(join(vault, w.path), w.data);
    }
  }
  return { changes };
}
