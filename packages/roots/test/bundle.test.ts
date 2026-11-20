import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { shippedBundle, shippedQuestions, shippedTemplate, type NoteKind } from "../src/assets.js";
import { buildBundle } from "../src/bundle.js";
import { notePath } from "../src/dates.js";
import { newNote } from "../src/notes.js";
import { render } from "../src/render.js";
import { repairText } from "../src/repair.js";
import { fixtureDates, kinds, shipped } from "./roots-helpers.js";

type Tp = Record<string, unknown>;
type Roots = (tp: Tp) => Promise<string>;

interface Button {
  text: string;
  click: () => void;
}

class FakeModal {
  static opened: FakeModal[] = [];
  static choose: "Apply" | "Cancel" = "Apply";
  texts: string[] = [];
  buttons: Button[] = [];
  contentEl = {
    createEl: (_tag: string, options?: { text?: string }) => {
      const el = {
        text: options?.text ?? "",
        addEventListener: (_event: string, handler: () => void) => {
          this.buttons.push({ text: el.text, click: handler });
        },
      };
      if (_tag !== "button") this.texts.push(el.text);
      return el;
    },
    empty: () => undefined,
  };
  constructor(public app: unknown) {}
  open(): void {
    FakeModal.opened.push(this);
    (this as unknown as { onOpen(): void }).onOpen();
    this.buttons.find((b) => b.text === FakeModal.choose)?.click();
  }
  close(): void {
    (this as unknown as { onClose?(): void }).onClose?.();
  }
}

interface Fake {
  files: Map<string, string>;
  folders: Set<string>;
  opened: string[];
  tp: (basename: string, title: string, extra?: Partial<Record<string, unknown>>) => Tp;
  active: { path: string } | null;
}

function fake(): Fake {
  const files = new Map<string, string>();
  const folders = new Set<string>();
  const opened: string[] = [];
  const state: Fake = {
    files,
    folders,
    opened,
    active: null,
    tp: (basename, title, extra = {}) => ({
      config: { template_file: { basename } },
      file: { title, content: "", path: () => `${title}.md` },
      date: { now: () => "2026-11-05" },
      obsidian: { Modal: FakeModal },
      app: {
        vault: {
          adapter: {
            read: (path: string) =>
              files.has(path)
                ? Promise.resolve(files.get(path) as string)
                : Promise.reject(new Error("ENOENT")),
            exists: (path: string) => Promise.resolve(files.has(path) || folders.has(path)),
            mkdir: (path: string) => {
              folders.add(path);
              return Promise.resolve();
            },
          },
          create: (path: string, text: string) => {
            files.set(path, text);
            return Promise.resolve({ path });
          },
          read: (file: { path: string }) => Promise.resolve(files.get(file.path) as string),
          modify: (file: { path: string }, text: string) => {
            files.set(file.path, text);
            return Promise.resolve();
          },
        },
        workspace: {
          getActiveFile: () => state.active,
          openLinkText: (path: string) => {
            opened.push(path);
            return Promise.resolve();
          },
        },
      },
      ...extra,
    }),
  };
  files.set("1-Roots/_roots/questions.md", shippedQuestions());
  for (const k of kinds) files.set(`1-Roots/_roots/templates/${k}.md`, shippedTemplate(k));
  return state;
}

function load(code: string): Roots {
  const module = { exports: {} as unknown };
  const req = (name: string): unknown => {
    throw new Error(`the bundle asked for ${name}`);
  };
  new Function("module", "exports", "require", code)(module, module.exports, req);
  return module.exports as Roots;
}

/** The name Obsidian gives a new note of this kind on this date: its file name without `.md`. */
const nameOf = (kind: NoteKind, date: string): string =>
  (notePath(kind, date).split("/").pop() as string).replace(/\.md$/, "");

describe("the bundle", () => {
  it("is the file the package ships, built from the sources", () => {
    expect(shippedBundle()).toBe(buildBundle());
  });

  it("is CommonJS with no imports, no node: modules and no file system", () => {
    const code = shippedBundle();
    expect(code).toMatch(/module\.exports\s*=/);
    expect(code).not.toMatch(/^\s*(import|export)\s/m);
    expect(code).not.toMatch(/require\(["']node:/);
    expect(code).not.toMatch(/require\(["'](fs|path|child_process)["']\)/);
  });

  it("is the same bytes every time it is built", () => {
    expect(buildBundle()).toBe(buildBundle());
  });
});

describe("a note kind's launcher run through the bundle under a Templater stub", () => {
  const roots = load(shippedBundle());

  it.each(kinds)(
    "gives %s the bytes the renderer gives, for the seven fixture dates",
    async (kind) => {
      for (const date of fixtureDates) {
        const f = fake();
        const out = await roots(f.tp(kind, nameOf(kind, date)));
        expect(out, `${kind} ${date}`).toBe(render(kind, date, shipped(kind)));
      }
    },
  );

  it.each(["daily", "weekly", "monthly", "quarterly", "yearly", "home"] as const)(
    "matches `discretion roots new` byte for byte for %s",
    async (kind: NoteKind) => {
      const dir = mkdtempSync(join(tmpdir(), "roots-parity-"));
      try {
        const f = fake();
        for (const [path, text] of f.files) {
          const { mkdirSync, writeFileSync } = await import("node:fs");
          const { dirname } = await import("node:path");
          mkdirSync(dirname(join(dir, path)), { recursive: true });
          writeFileSync(join(dir, path), text);
        }
        const date = "2026-11-05";
        const written = await newNote({ vault: dir, kind, date });
        const out = await roots(f.tp(kind, nameOf(kind, date)));
        expect(out).toBe(readFileSync(join(dir, written.path), "utf8"));
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    },
  );

  it("takes the date from the new note's name, and today's date when the name says nothing", async () => {
    const f = fake();
    expect(await roots(f.tp("daily", "2026-11-06"))).toContain("# Friday 6 November 2026");
    expect(await roots(f.tp("daily", "Untitled"))).toContain("# Thursday 5 November 2026");
    expect(await roots(f.tp("weekly", "2026-W53"))).toContain("# Week 53, 2026");
  });

  it("uses the vault's edited template", async () => {
    const f = fake();
    f.files.set("1-Roots/_roots/templates/daily.md", "mine {{date}}\n");
    expect(await roots(f.tp("daily", "2026-11-06"))).toBe("mine 2026-11-06\n");
  });

  it("inserts nothing into a note that already has content", async () => {
    const f = fake();
    const tp = f.tp("daily", "2026-11-05");
    (tp.file as { content: string }).content = "# my note\n";
    expect(await roots(tp)).toBe("");
  });

  it("today creates today's note from the same render, opens it and inserts nothing", async () => {
    const f = fake();
    const out = await roots(f.tp("today", "Untitled"));
    expect(out).toBe("");
    const path = "1-Roots/Daily/2026/11/2026-11-05.md";
    expect(f.files.get(path)).toBe(render("daily", "2026-11-05", shipped("daily")));
    expect(f.folders.has("1-Roots/Daily/2026/11")).toBe(true);
    expect(f.opened).toEqual([path]);
  });

  it("today opens an existing note without touching it", async () => {
    const f = fake();
    const path = "1-Roots/Daily/2026/11/2026-11-05.md";
    f.files.set(path, "mine\n");
    expect(await roots(f.tp("today", "Untitled"))).toBe("");
    expect(f.files.get(path)).toBe("mine\n");
    expect(f.opened).toEqual([path]);
  });

  describe("repair", () => {
    const path = "1-Roots/Daily/2026/11/2026-11-05.md";
    const broken = (): string =>
      render("daily", "2026-11-05", shipped("daily"))
        .replace(
          "<!-- discretion:journal:start -->\n\n",
          "<!-- discretion:journal:start -->\nkept text\n",
        )
        .replace(
          "## Captured\n\n<!-- discretion:captured:start -->\n<!-- discretion:captured:end -->\n\n",
          "",
        );

    it("shows the diff in a modal and writes only after Apply", async () => {
      FakeModal.opened = [];
      FakeModal.choose = "Apply";
      const f = fake();
      f.files.set(path, broken());
      f.active = { path };
      expect(await roots(f.tp("repair", "2026-11-05"))).toBe("");
      expect(FakeModal.opened).toHaveLength(1);
      expect(FakeModal.opened[0]?.texts.join("\n")).toContain("+## Captured");
      expect(f.files.get(path)).toBe(
        repairText(broken(), render("daily", "2026-11-05", shipped("daily"))),
      );
      expect(f.files.get(path)).toContain("kept text");
    });

    it("writes nothing after Cancel", async () => {
      FakeModal.opened = [];
      FakeModal.choose = "Cancel";
      const f = fake();
      f.files.set(path, broken());
      f.active = { path };
      await roots(f.tp("repair", "2026-11-05"));
      expect(FakeModal.opened).toHaveLength(1);
      expect(f.files.get(path)).toBe(broken());
    });

    it("shows no modal when the note needs no repair", async () => {
      FakeModal.opened = [];
      FakeModal.choose = "Apply";
      const f = fake();
      const text = render("daily", "2026-11-05", shipped("daily"));
      f.files.set(path, text);
      f.active = { path };
      await roots(f.tp("repair", "2026-11-05"));
      expect(FakeModal.opened).toHaveLength(0);
      expect(f.files.get(path)).toBe(text);
    });

    it("does nothing when no note is open or the open note is not a Roots note", async () => {
      FakeModal.opened = [];
      const f = fake();
      expect(await roots(f.tp("repair", "x"))).toBe("");
      f.files.set("Elsewhere/idea.md", "# idea\n");
      f.active = { path: "Elsewhere/idea.md" };
      expect(await roots(f.tp("repair", "idea"))).toBe("");
      expect(f.files.get("Elsewhere/idea.md")).toBe("# idea\n");
      expect(FakeModal.opened).toHaveLength(0);
    });
  });
});
