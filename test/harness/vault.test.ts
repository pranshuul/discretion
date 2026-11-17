import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { makeZip, scratch } from "./support.js";
import { buildFixtureVault, locateTimeGarden, vaultFolders } from "./vault.js";

/** A directory shaped like a Time Garden copy. */
function garden(): string {
  const dir = scratch();
  mkdirSync(join(dir, "01 Daily"));
  mkdirSync(join(dir, ".obsidian"));
  writeFileSync(join(dir, "01 Daily", "2026-11-02.md"), "# Monday\n");
  writeFileSync(join(dir, ".obsidian", "app.json"), "{}\n");
  writeFileSync(join(dir, ".DS_Store"), "junk");
  return dir;
}

describe("vaultFolders", () => {
  it("lists the four folders and the Architecture's subfolders", () => {
    for (const folder of [
      "1-Roots",
      "2-Orchard",
      "3-Mycelium",
      "3-Mycelium/canon",
      "3-Mycelium/inbox",
      "3-Mycelium/goals",
      "3-Mycelium/tasks",
      "3-Mycelium/plans",
      "3-Mycelium/review/items",
      "3-Mycelium/reels",
      "3-Mycelium/days",
      "3-Mycelium/ribbons",
      "3-Mycelium/config",
      "4-Nursery",
      "4-Nursery/cards",
      "4-Nursery/concepts",
    ]) {
      expect(vaultFolders).toContain(folder);
    }
  });
});

describe("buildFixtureVault from a directory", () => {
  it("lays every folder and puts Time Garden under 1-Roots", () => {
    const dir = join(scratch(), "vault");
    expect(buildFixtureVault({ dir, timeGarden: garden() })).toBe(dir);
    for (const folder of vaultFolders) {
      expect(statSync(join(dir, folder)).isDirectory()).toBe(true);
    }
    expect(readFileSync(join(dir, "1-Roots", "01 Daily", "2026-11-02.md"), "utf8")).toBe(
      "# Monday\n",
    );
    expect(readFileSync(join(dir, "1-Roots", ".obsidian", "app.json"), "utf8")).toBe("{}\n");
  });

  it("leaves out macOS junk", () => {
    const dir = join(scratch(), "vault");
    buildFixtureVault({ dir, timeGarden: garden() });
    expect(existsSync(join(dir, "1-Roots", ".DS_Store"))).toBe(false);
  });

  it("writes extra files at their relative paths", () => {
    const dir = join(scratch(), "vault");
    buildFixtureVault({
      dir,
      timeGarden: garden(),
      files: { "2-Orchard/Health plan.md": "plan\n", "3-Mycelium/canon/a.md": "fact\n" },
    });
    expect(readFileSync(join(dir, "2-Orchard", "Health plan.md"), "utf8")).toBe("plan\n");
    expect(readFileSync(join(dir, "3-Mycelium", "canon", "a.md"), "utf8")).toBe("fact\n");
  });

  it("refuses an extra file outside the vault", () => {
    const dir = join(scratch(), "vault");
    expect(() =>
      buildFixtureVault({ dir, timeGarden: garden(), files: { "../escape.md": "x" } }),
    ).toThrow(/outside/);
    expect(() =>
      buildFixtureVault({
        dir: join(scratch(), "v2"),
        timeGarden: garden(),
        files: { "/abs.md": "x" },
      }),
    ).toThrow(/outside/);
  });

  it("refuses a vault directory that already holds files", () => {
    const dir = scratch();
    writeFileSync(join(dir, "stray.txt"), "x");
    expect(() => buildFixtureVault({ dir, timeGarden: garden() })).toThrow(/not empty/);
  });

  it("accepts an existing empty directory", () => {
    const dir = scratch();
    expect(() => buildFixtureVault({ dir, timeGarden: garden() })).not.toThrow();
    expect(readdirSync(dir).sort()).toEqual(["1-Roots", "2-Orchard", "3-Mycelium", "4-Nursery"]);
  });

  it("refuses a missing Time Garden source", () => {
    expect(() =>
      buildFixtureVault({ dir: join(scratch(), "vault"), timeGarden: join(scratch(), "nope") }),
    ).toThrow(/Time Garden/);
  });
});

describe("buildFixtureVault from a zip", () => {
  const zipFile = (): string => {
    const path = join(scratch(), "tg.zip");
    writeFileSync(
      path,
      makeZip({
        "Time-Garden-Vault/": "",
        "__MACOSX/._Time-Garden-Vault": "junk",
        "Time-Garden-Vault/01 Daily/": "",
        "Time-Garden-Vault/01 Daily/2026-11-02.md": "# Monday\n",
        "Time-Garden-Vault/.obsidian/": "",
        "Time-Garden-Vault/.obsidian/app.json": "{}\n",
        "Time-Garden-Vault/.DS_Store": "junk",
      }),
    );
    return path;
  };

  it("strips the zip's top folder and macOS junk", () => {
    const dir = join(scratch(), "vault");
    buildFixtureVault({ dir, timeGarden: zipFile() });
    expect(readFileSync(join(dir, "1-Roots", "01 Daily", "2026-11-02.md"), "utf8")).toBe(
      "# Monday\n",
    );
    expect(readFileSync(join(dir, "1-Roots", ".obsidian", "app.json"), "utf8")).toBe("{}\n");
    expect(readdirSync(join(dir, "1-Roots")).sort()).toEqual(["01 Daily"]);
    expect(existsSync(join(dir, "1-Roots", "Time-Garden-Vault"))).toBe(false);
    expect(existsSync(join(dir, "__MACOSX"))).toBe(false);
  });

  it("lays the same folders as from a directory", () => {
    const dir = join(scratch(), "vault");
    buildFixtureVault({ dir, timeGarden: zipFile() });
    for (const folder of vaultFolders) {
      expect(statSync(join(dir, folder)).isDirectory()).toBe(true);
    }
  });
});

describe("locateTimeGarden", () => {
  it("prefers TIME_GARDEN_DIR, returning the zip inside it", () => {
    const dir = scratch();
    writeFileSync(join(dir, "Time-Garden-Vault.zip"), makeZip({ "a/": "" }));
    expect(locateTimeGarden({ TIME_GARDEN_DIR: dir })).toBe(join(dir, "Time-Garden-Vault.zip"));
  });

  it("returns the directory itself when it holds no zip", () => {
    const dir = garden();
    expect(locateTimeGarden({ TIME_GARDEN_DIR: dir })).toBe(dir);
  });

  it("falls back to ~/inbox/time-garden", () => {
    const home = scratch();
    mkdirSync(join(home, "inbox", "time-garden"), { recursive: true });
    writeFileSync(join(home, "inbox", "time-garden", "x.zip"), makeZip({ "a/": "" }));
    expect(locateTimeGarden({ HOME: home })).toBe(join(home, "inbox", "time-garden", "x.zip"));
  });
});

describe("with Pranshul's real Time Garden", () => {
  const found = locateTimeGarden();
  beforeAll(() => {
    if (found === undefined) {
      console.log(
        "skipped: Time Garden not found (set TIME_GARDEN_DIR or use ~/inbox/time-garden)",
      );
    }
  });

  it.skipIf(found === undefined)("lays under 1-Roots without committing anything", () => {
    const dir = join(scratch(), "vault");
    buildFixtureVault({ dir, timeGarden: found as string });
    const roots = readdirSync(join(dir, "1-Roots"));
    expect(roots).toContain("01 Daily");
    expect(roots).toContain("06 Templates");
    expect(roots).toContain(".obsidian");
    expect(roots).not.toContain("__MACOSX");
  });
});
