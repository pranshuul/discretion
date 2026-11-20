import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DiscretionError } from "@discretion/core";
import { PluginsLock } from "@discretion/model";
import {
  noteKinds,
  shippedCss,
  shippedQuestions,
  shippedTemplate,
  templateNames,
} from "../src/assets.js";
import { install } from "../src/install.js";
import { content, fakePins, files, startFakeGithub, type FakeGithub } from "./fake-github.js";

let github: FakeGithub;
const made: string[] = [];

beforeEach(async () => {
  github = await startFakeGithub();
});

afterEach(async () => {
  await github.close();
  for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function vaultDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "roots-install-"));
  made.push(dir);
  return join(dir, "vault");
}

const run = (vault: string, extra: Record<string, unknown> = {}) =>
  install({ vault, githubBase: github.base, plugins: fakePins(), ...extra });

const read = (vault: string, path: string): string => readFileSync(join(vault, path), "utf8");
const json = (vault: string, path: string): Record<string, unknown> =>
  JSON.parse(read(vault, path)) as Record<string, unknown>;
const put = (vault: string, path: string, text: string): void => {
  mkdirSync(dirname(join(vault, path)), { recursive: true });
  writeFileSync(join(vault, path), text);
};

describe("roots install", () => {
  it("lays out 1-Roots and _roots", async () => {
    const vault = vaultDir();
    await run(vault);
    for (const dir of [
      "Daily",
      "Weekly",
      "Monthly",
      "Quarterly",
      "Yearly",
      "_roots/templates",
      "_roots/scripts",
    ]) {
      expect(existsSync(join(vault, "1-Roots", dir)), dir).toBe(true);
    }
  });

  it("writes the default templates, questions.md and roots.css", async () => {
    const vault = vaultDir();
    await run(vault);
    for (const name of templateNames) {
      expect(read(vault, `1-Roots/_roots/templates/${name}.md`)).toBe(shippedTemplate(name));
    }
    expect(read(vault, "1-Roots/_roots/questions.md")).toBe(shippedQuestions());
    expect(read(vault, "1-Roots/_roots/roots.css")).toBe(shippedCss());
    expect(read(vault, ".obsidian/snippets/roots.css")).toBe(shippedCss());
  });

  it("creates Roots.md once from the home template", async () => {
    const vault = vaultDir();
    await run(vault);
    const home = read(vault, "1-Roots/Roots.md");
    expect(home.startsWith("---\nroots: 1\nkind: home\n---\n\n# Roots\n")).toBe(true);
    expect(home).not.toContain("{{");
    expect(home.match(/```dataviewjs/g)).toHaveLength(4);
    for (const heading of ["Today", "This week", "Streaks", "30-day rating trend"]) {
      expect(home).toContain(`## ${heading}\n`);
    }
  });

  it("writes the .obsidian settings Roots needs", async () => {
    const vault = vaultDir();
    await run(vault);
    const templater = json(vault, ".obsidian/plugins/templater-obsidian/data.json");
    expect(templater.templates_folder).toBe("1-Roots/_roots/templates");
    expect(templater.user_scripts_folder).toBe("1-Roots/_roots/scripts");
    expect(templater.enabled_templates_hotkeys).toBeUndefined();
    const core = json(vault, ".obsidian/core-plugins.json");
    expect(core["daily-notes"]).toBe(false);
    expect(core["file-recovery"]).toBeUndefined();
    expect(existsSync(join(vault, ".obsidian/hotkeys.json"))).toBe(false);
    expect(json(vault, ".obsidian/appearance.json").enabledCssSnippets).toEqual(["roots"]);
    const dataview = json(vault, ".obsidian/plugins/dataview/data.json");
    expect(dataview.enableDataviewJs).toBe(true);
    expect(dataview.enableInlineDataviewJs).toBe(true);
    expect(
      (JSON.parse(read(vault, ".obsidian/community-plugins.json")) as string[]).sort(),
    ).toEqual(["dataview", "obsidian-meta-bind-plugin", "templater-obsidian"]);
  });

  it("downloads each plugin's files into .obsidian/plugins/<id>/ and locks them", async () => {
    const vault = vaultDir();
    await run(vault);
    for (const p of fakePins()) {
      for (const f of files) {
        expect(read(vault, `.obsidian/plugins/${p.id}/${f}`)).toBe(content(p.id, f));
      }
    }
    expect(github.requests).toHaveLength(9);
    const text = read(vault, ".discretion/plugins.lock.json");
    const lock = JSON.parse(text) as { schema: string; plugins: { id: string }[] };
    expect(lock.schema).toBe("plugins-lock/1");
    expect(lock.plugins.map((p) => p.id)).toEqual([
      "dataview",
      "obsidian-meta-bind-plugin",
      "templater-obsidian",
    ]);
    expect(lock.plugins[0]).toMatchObject({
      version: "0.5.68",
      files: fakePins().find((p) => p.id === "dataview")?.files,
    });
    expect(text.endsWith("}\n")).toBe(true);
    expect(text).toBe(`${JSON.stringify(JSON.parse(text), null, 2)}\n`);
  });

  it("writes a lock that is valid plugins-lock/1", async () => {
    const vault = vaultDir();
    await run(vault);
    const lock = PluginsLock.parse(JSON.parse(read(vault, ".discretion/plugins.lock.json")));
    expect(lock.plugins.map((p) => p.version)).toEqual(["0.5.68", "1.5.1", "2.27.0"]);
  });

  it("refuses on a hash mismatch with D2010 and writes nothing", async () => {
    const vault = vaultDir();
    github.override.set("/blacksmithgu/obsidian-dataview/releases/download/0.5.68/main.js", "evil");
    const error = await run(vault).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(DiscretionError);
    const refused = error as DiscretionError;
    expect(refused.code).toBe("D2010");
    expect(refused.message).toContain("dataview");
    expect(refused.message).toContain("main.js");
    expect(refused.remedy).not.toBe("");
    expect(existsSync(vault)).toBe(false);
  });

  it("refuses a mismatch even when the vault already exists, and leaves it as it was", async () => {
    const vault = vaultDir();
    put(vault, "note.md", "mine");
    github.override.set("/SilentVoid13/Templater/releases/download/2.27.0/styles.css", "x");
    await expect(run(vault)).rejects.toMatchObject({ code: "D2010" });
    expect(existsSync(join(vault, "1-Roots"))).toBe(false);
    expect(existsSync(join(vault, ".obsidian"))).toBe(false);
    expect(existsSync(join(vault, ".discretion"))).toBe(false);
    expect(read(vault, "note.md")).toBe("mine");
  });

  it("refuses with D2010 when a download fails, and writes nothing", async () => {
    const vault = vaultDir();
    github.missing.add("/mProjectsCode/obsidian-meta-bind-plugin/releases/download/1.5.1/main.js");
    const error = (await run(vault).catch((e: unknown) => e)) as DiscretionError;
    expect(error).toBeInstanceOf(DiscretionError);
    expect(error.code).toBe("D2010");
    expect(error.message).toContain("obsidian-meta-bind-plugin");
    expect(existsSync(vault)).toBe(false);
  });

  it("is idempotent: a second run changes and downloads nothing", async () => {
    const vault = vaultDir();
    const first = await run(vault);
    expect(first.changes.length).toBeGreaterThan(0);
    const before = github.requests.length;
    const second = await run(vault);
    expect(second).toEqual({ changes: [] });
    expect(github.requests).toHaveLength(before);
  });

  it("never overwrites an edited template, questions.md, roots.css or Roots.md", async () => {
    const vault = vaultDir();
    await run(vault);
    for (const path of [
      ...noteKinds.map((k) => `1-Roots/_roots/templates/${k}.md`),
      "1-Roots/_roots/questions.md",
      "1-Roots/_roots/roots.css",
      "1-Roots/Roots.md",
    ]) {
      put(vault, path, `my own ${path}\n`);
    }
    const again = await run(vault);
    for (const path of [
      ...noteKinds.map((k) => `1-Roots/_roots/templates/${k}.md`),
      "1-Roots/_roots/questions.md",
      "1-Roots/_roots/roots.css",
      "1-Roots/Roots.md",
    ]) {
      expect(read(vault, path)).toBe(`my own ${path}\n`);
    }
    expect(again.changes.filter((c) => c.includes("templates/") || c.includes("Roots.md"))).toEqual(
      [],
    );
  });

  it("builds Roots.md from an edited home template", async () => {
    const vault = vaultDir();
    put(vault, "1-Roots/_roots/templates/home.md", "{{frontmatter}}\n\n# {{title}} (mine)\n");
    await run(vault);
    expect(read(vault, "1-Roots/Roots.md")).toBe(
      "---\nroots: 1\nkind: home\n---\n\n# Roots (mine)\n",
    );
  });

  it("brings roots.css's snippet copy back in line with _roots/roots.css", async () => {
    const vault = vaultDir();
    await run(vault);
    put(vault, "1-Roots/_roots/roots.css", "body { --roots-done: red; }\n");
    const again = await run(vault);
    expect(read(vault, ".obsidian/snippets/roots.css")).toBe("body { --roots-done: red; }\n");
    expect(again.changes.some((c) => c.includes("snippets/roots.css"))).toBe(true);
  });

  it("keeps settings it does not own and merges its own in", async () => {
    const vault = vaultDir();
    put(vault, ".obsidian/core-plugins.json", `{"file-explorer":true,"daily-notes":true}`);
    put(vault, ".obsidian/community-plugins.json", `["calendar"]`);
    put(vault, ".obsidian/appearance.json", `{"theme":"obsidian","enabledCssSnippets":["mine"]}`);
    put(vault, ".obsidian/plugins/dataview/data.json", `{"refreshInterval":5000}`);
    put(
      vault,
      ".obsidian/plugins/templater-obsidian/data.json",
      `{"trigger_on_file_creation":true}`,
    );
    await run(vault);
    expect(json(vault, ".obsidian/core-plugins.json")).toEqual({
      "daily-notes": false,
      "file-explorer": true,
    });
    expect(json(vault, ".obsidian/community-plugins.json")).toEqual([
      "calendar",
      "dataview",
      "obsidian-meta-bind-plugin",
      "templater-obsidian",
    ]);
    expect(json(vault, ".obsidian/appearance.json")).toEqual({
      enabledCssSnippets: ["mine", "roots"],
      theme: "obsidian",
    });
    expect(json(vault, ".obsidian/plugins/dataview/data.json")).toEqual({
      enableDataviewJs: true,
      enableInlineDataviewJs: true,
      refreshInterval: 5000,
    });
    expect(json(vault, ".obsidian/plugins/templater-obsidian/data.json")).toMatchObject({
      trigger_on_file_creation: true,
      templates_folder: "1-Roots/_roots/templates",
    });
  });

  it("handles core-plugins.json written as a list of enabled plugins", async () => {
    const vault = vaultDir();
    put(vault, ".obsidian/core-plugins.json", `["file-explorer","daily-notes"]`);
    await run(vault);
    expect(json(vault, ".obsidian/core-plugins.json")).toEqual(["file-explorer"]);
  });

  it("re-downloads a plugin file that no longer matches its pin, and re-locks", async () => {
    const vault = vaultDir();
    await run(vault);
    writeFileSync(join(vault, ".obsidian/plugins/dataview/main.js"), "tampered");
    const before = github.requests.length;
    const again = await run(vault);
    expect(read(vault, ".obsidian/plugins/dataview/main.js")).toBe(content("dataview", "main.js"));
    expect(github.requests.length - before).toBe(1);
    expect(again.changes.some((c) => c.includes("dataview") && c.includes("main.js"))).toBe(true);
  });

  it("rewrites a missing lock without downloading again", async () => {
    const vault = vaultDir();
    await run(vault);
    rmSync(join(vault, ".discretion"), { recursive: true });
    const before = github.requests.length;
    await run(vault);
    expect(github.requests).toHaveLength(before);
    expect(existsSync(join(vault, ".discretion/plugins.lock.json"))).toBe(true);
  });

  it("with dryRun lists what it would do, downloads and writes nothing", async () => {
    const vault = vaultDir();
    const result = await run(vault, { dryRun: true });
    expect(existsSync(vault)).toBe(false);
    expect(github.requests).toHaveLength(0);
    const text = result.changes.join("\n");
    for (const part of [
      "1-Roots/Roots.md",
      "1-Roots/_roots/templates/daily.md",
      "1-Roots/_roots/questions.md",
      "snippets/roots.css",
      "dataview",
      "templater-obsidian",
      "obsidian-meta-bind-plugin",
      "core-plugins.json",
      "plugins.lock.json",
    ]) {
      expect(text, part).toContain(part);
    }
  });

  it("dryRun on an installed vault reports nothing", async () => {
    const vault = vaultDir();
    await run(vault);
    expect(await run(vault, { dryRun: true })).toEqual({ changes: [] });
  });

  it("downloads from github.com unless told otherwise", async () => {
    const urls: string[] = [];
    const vault = vaultDir();
    const stub = ((url: string) => {
      urls.push(url);
      return Promise.resolve(new Response("x", { status: 200 }));
    }) as unknown as typeof fetch;
    await install({ vault, fetch: stub }).catch(() => undefined);
    expect(urls[0]).toMatch(
      /^https:\/\/github\.com\/[^/]+\/[^/]+\/releases\/download\/[^/]+\/[^/]+$/,
    );
  });
});
