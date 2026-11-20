import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { install } from "../src/install.js";
import { status, type StatusItem } from "../src/status.js";
import { fakePins, startFakeGithub, type FakeGithub } from "./fake-github.js";

let github: FakeGithub;
let vault: string;
const made: string[] = [];

beforeEach(async () => {
  github = await startFakeGithub();
  const dir = mkdtempSync(join(tmpdir(), "roots-status-"));
  made.push(dir);
  vault = join(dir, "vault");
});

afterEach(async () => {
  await github.close();
  for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const installed = async (): Promise<void> => {
  await install({ vault, githubBase: github.base, plugins: fakePins(), platform: "linux" });
};
const check = (): Promise<StatusItem[]> => status({ vault, plugins: fakePins() });
const put = (path: string, text: string): void => {
  mkdirSync(dirname(join(vault, path)), { recursive: true });
  writeFileSync(join(vault, path), text);
};
const find = (items: StatusItem[], kind: StatusItem["kind"], name: string) =>
  items.find((i) => i.kind === kind && i.name === name);

describe("roots status", () => {
  it("lists nothing on a fresh install", async () => {
    await installed();
    expect(await check()).toEqual([]);
  });

  it("reports an uninstalled vault as drift", async () => {
    const items = await check();
    expect(items.length).toBeGreaterThan(0);
    expect(items.every((i) => i.severity === "drift")).toBe(true);
    expect(find(items, "lock", "plugins.lock.json")).toBeDefined();
  });

  it("flags a plugin file whose hash no longer matches the pin", async () => {
    await installed();
    put(".obsidian/plugins/dataview/main.js", "tampered");
    const item = find(await check(), "plugin", "dataview/main.js");
    expect(item?.severity).toBe("drift");
    expect(item?.message).toContain("SHA-256");
  });

  it("flags a missing plugin file", async () => {
    await installed();
    rmSync(join(vault, ".obsidian/plugins/templater-obsidian/styles.css"));
    const item = find(await check(), "plugin", "templater-obsidian/styles.css");
    expect(item?.severity).toBe("drift");
    expect(item?.message).toContain("missing");
  });

  it("flags a lock that records another version than the pin", async () => {
    await installed();
    const pins = fakePins().map((p) => (p.id === "dataview" ? { ...p, version: "0.5.69" } : p));
    const items = await status({ vault, plugins: pins });
    const item = find(items, "lock", "dataview");
    expect(item?.severity).toBe("drift");
    expect(item?.message).toContain("0.5.68");
    expect(item?.message).toContain("0.5.69");
  });

  it("flags a lock that was edited away from what is on disk", async () => {
    await installed();
    const lock = JSON.parse(
      (await import("node:fs")).readFileSync(join(vault, ".discretion/plugins.lock.json"), "utf8"),
    ) as { plugins: { files: Record<string, string> }[] };
    (lock.plugins[0] as { files: Record<string, string> }).files["main.js"] = "0".repeat(64);
    put(".discretion/plugins.lock.json", JSON.stringify(lock));
    expect(find(await check(), "lock", "dataview")?.severity).toBe("drift");
  });

  it("flags a setting Roots needs that was changed", async () => {
    await installed();
    put(
      ".obsidian/plugins/templater-obsidian/data.json",
      `{"templates_folder":"Templates","user_scripts_folder":"1-Roots/_roots/scripts"}`,
    );
    put(".obsidian/core-plugins.json", `{"daily-notes":true,"file-recovery":true}`);
    put(".obsidian/appearance.json", `{"enabledCssSnippets":[]}`);
    put(".obsidian/plugins/dataview/data.json", `{"enableDataviewJs":false}`);
    const items = await check();
    for (const name of [
      "templater template folder",
      "core Daily notes plugin",
      "roots CSS snippet",
      "Dataview JavaScript queries",
    ]) {
      expect(find(items, "setting", name)?.severity, name).toBe("drift");
    }
  });

  it("lists a template that differs from the shipped default as modified, not drift", async () => {
    await installed();
    put("1-Roots/_roots/templates/daily.md", "{{frontmatter}}\n\n# {{title}}\n");
    const items = await check();
    expect(items).toEqual([
      {
        kind: "template",
        name: "daily",
        severity: "modified",
        message: expect.stringContaining("differs from the shipped default") as string,
      },
    ]);
  });

  it("lists a missing template as drift", async () => {
    await installed();
    rmSync(join(vault, "1-Roots/_roots/templates/weekly.md"));
    expect(find(await check(), "template", "weekly")?.severity).toBe("drift");
  });

  it("lists an edited questions.md and roots.css as modified, and a missing one as drift", async () => {
    await installed();
    put("1-Roots/_roots/questions.md", "# mine\n");
    rmSync(join(vault, "1-Roots/_roots/roots.css"));
    const items = await check();
    expect(find(items, "file", "questions.md")?.severity).toBe("modified");
    expect(find(items, "file", "roots.css")?.severity).toBe("drift");
  });
});
