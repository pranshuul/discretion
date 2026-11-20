import { dateFromName, notePath } from "./dates.js";
import { unifiedDiff } from "./diff.js";
import type { NoteKind } from "./kinds.js";
import { renderNote, type Reader, type Snippets } from "./render.js";
import { identifyNote, repairText } from "./repair.js";

/** The parts of Templater's `tp` object the launcher uses. */
export interface TemplaterLike {
  [key: string]: unknown;
}

interface Adapter {
  read(path: string): Promise<string>;
  exists(path: string): Promise<boolean>;
  mkdir(path: string): Promise<void>;
}

interface Vault {
  adapter: Adapter;
  create(path: string, text: string): Promise<unknown>;
  read(file: unknown): Promise<string>;
  modify(file: unknown, text: string): Promise<void>;
}

interface App {
  vault: Vault;
  workspace: {
    getActiveFile(): { path: string } | null;
    openLinkText(path: string, source: string, newLeaf?: boolean): Promise<void>;
  };
}

interface ModalClass {
  new (app: App): {
    contentEl: {
      createEl(
        tag: string,
        options?: { text?: string },
      ): {
        addEventListener(event: string, handler: () => void): void;
      };
    };
    open(): void;
    close(): void;
  };
}

declare const require: (name: string) => unknown;

const kindsOf: readonly NoteKind[] = ["daily", "weekly", "monthly", "quarterly", "yearly", "home"];

/** Shows the diff, and resolves true only when Apply is pressed. */
function confirmDiff(tp: TemplaterLike, app: App, diff: string): Promise<boolean> {
  const obsidian = (tp.obsidian ?? require("obsidian")) as { Modal: ModalClass };
  return new Promise((resolve) => {
    let decided = false;
    const decide = (value: boolean, close: () => void): void => {
      if (decided) return;
      decided = true;
      resolve(value);
      close();
    };
    class RepairModal extends obsidian.Modal {
      constructor() {
        super(app);
      }
      onOpen(): void {
        this.contentEl.createEl("h3", { text: "Repair this note" });
        this.contentEl.createEl("pre", { text: diff });
        const apply = this.contentEl.createEl("button", { text: "Apply" });
        apply.addEventListener("click", () => decide(true, () => this.close()));
        const cancel = this.contentEl.createEl("button", { text: "Cancel" });
        cancel.addEventListener("click", () => decide(false, () => this.close()));
      }
      onClose(): void {
        decide(false, () => undefined);
      }
    }
    new RepairModal().open();
  });
}

/** The function Templater calls as `tp.user.roots(tp)`. */
export function createLauncher(snippets: Snippets): (tp: TemplaterLike) => Promise<string> {
  return async (tp) => {
    const app = tp.app as App;
    const config = tp.config as { template_file?: { basename?: string } };
    const file = tp.file as { title: string; content?: string };
    const launcher = config.template_file?.basename ?? "";
    const now = (tp.date as { now(format: string): string }).now("YYYY-MM-DD");
    const read: Reader = (path) => app.vault.adapter.read(path).catch(() => null);

    if (launcher === "today") {
      const path = notePath("daily", now);
      if (!(await app.vault.adapter.exists(path))) {
        const text = await renderNote("daily", now, read, snippets);
        const parts = path.split("/").slice(0, -1);
        for (let at = 1; at <= parts.length; at++) {
          const folder = parts.slice(0, at).join("/");
          if (!(await app.vault.adapter.exists(folder))) await app.vault.adapter.mkdir(folder);
        }
        await app.vault.create(path, text);
      }
      await app.workspace.openLinkText(path, "", false);
      return "";
    }

    if (launcher === "repair") {
      const active = app.workspace.getActiveFile();
      if (active === null) return "";
      const existing = await app.vault.read(active);
      const found = identifyNote(active.path, existing);
      if (found === null) return "";
      const fresh = await renderNote(found.kind, found.date, read, snippets);
      const repaired = repairText(existing, fresh);
      if (repaired === existing) return "";
      const diff = unifiedDiff(existing, repaired, active.path, `${active.path} (repaired)`);
      if (await confirmDiff(tp, app, diff)) await app.vault.modify(active, repaired);
      return "";
    }

    const kind = kindsOf.find((k) => k === launcher);
    if (kind === undefined) return "";
    if (typeof file.content === "string" && file.content.trim() !== "") return "";
    const date = dateFromName(kind, file.title) ?? now;
    return renderNote(kind, date, read, snippets);
  };
}
