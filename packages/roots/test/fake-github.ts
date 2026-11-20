/** Test support: a local stand-in for GitHub's release downloads and pins that match it. */
import { createHash } from "node:crypto";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import type { PinnedPlugin } from "../src/pins.js";

export const sha256 = (data: string | Buffer): string =>
  createHash("sha256").update(data).digest("hex");

const specs = [
  {
    id: "templater-obsidian",
    name: "Templater",
    repo: "SilentVoid13/Templater",
    version: "2.27.0",
  },
  { id: "dataview", name: "Dataview", repo: "blacksmithgu/obsidian-dataview", version: "0.5.68" },
  {
    id: "obsidian-meta-bind-plugin",
    name: "Meta Bind",
    repo: "mProjectsCode/obsidian-meta-bind-plugin",
    version: "1.5.1",
  },
];

export const files = ["main.js", "manifest.json", "styles.css"];

/** The bytes the fake server serves for a plugin file. */
export const content = (id: string, file: string): string => `// ${id} ${file}\n`;

/** Pins whose hashes match what the fake server serves. */
export function fakePins(): PinnedPlugin[] {
  return specs.map((s) => ({
    ...s,
    files: Object.fromEntries(files.map((f) => [f, sha256(content(s.id, f))])),
  }));
}

export interface FakeGithub {
  base: string;
  requests: string[];
  /** Serve these bytes for a path (`/<repo>/releases/download/<version>/<file>`) instead. */
  override: Map<string, string>;
  /** Answer these paths with 404. */
  missing: Set<string>;
  close(): Promise<void>;
}

export async function startFakeGithub(): Promise<FakeGithub> {
  const pins = fakePins();
  const requests: string[] = [];
  const override = new Map<string, string>();
  const missing = new Set<string>();
  const server: Server = createServer((req, res) => {
    const path = req.url ?? "";
    requests.push(path);
    const bytes = override.get(path);
    const found = pins.find((p) => path.startsWith(`/${p.repo}/releases/download/${p.version}/`));
    const file = path.split("/").pop() ?? "";
    if (missing.has(path) || (!bytes && (!found || !(file in found.files)))) {
      res.writeHead(404).end("not found");
      return;
    }
    res.writeHead(200).end(bytes ?? content(found?.id ?? "", file));
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const { port } = server.address() as AddressInfo;
  return {
    base: `http://127.0.0.1:${port}`,
    requests,
    override,
    missing,
    close: () => new Promise((done) => server.close(() => done())),
  };
}
