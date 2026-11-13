import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = fileURLToPath(new URL("../", import.meta.url));

function read(path: string): string {
  return readFileSync(`${root}${path}`, "utf8");
}

// The text of one job in the workflow: from its key at two spaces of indent
// to the next key at that indent, or the end of the file.
function job(workflow: string, name: string): string {
  const jobs = workflow.slice(workflow.indexOf("\njobs:\n") + "\njobs:\n".length);
  const start = jobs.search(new RegExp(`^  ${name}:$`, "m"));
  expect(start, `job ${name}`).toBeGreaterThanOrEqual(0);
  const rest = jobs.slice(start + name.length + 3);
  const end = rest.search(/^ {2}\S/m);
  return end === -1 ? rest : rest.slice(0, end);
}

// Every `run:` command of a job, in order.
function commands(text: string): string[] {
  return [...text.matchAll(/^\s+(?:- )?run: (.+)$/gm)].map((match) => String(match[1]).trim());
}

describe("CI workflow", () => {
  const workflow = () => read(".github/workflows/ci.yml");

  it("runs on pushes and pull requests", () => {
    expect(workflow()).toMatch(/^on:\n {2}push:\n {2}pull_request:\n/m);
  });

  it("runs the checks on Linux x86_64 and Linux arm64", () => {
    const check = job(workflow(), "check");
    expect(check).toMatch(/^ {8}runner: \[ubuntu-24\.04, ubuntu-24\.04-arm\]$/m);
    expect(check).toMatch(/^ {4}runs-on: \$\{\{ matrix\.runner \}\}$/m);
  });

  it("does not cancel one architecture when the other fails", () => {
    expect(job(workflow(), "check")).toMatch(/^ {6}fail-fast: false$/m);
  });

  it("uses the Node version pinned in .nvmrc and the pnpm pinned in packageManager", () => {
    const check = job(workflow(), "check");
    expect(check).toMatch(/^ {10}node-version-file: \.nvmrc$/m);
    expect(commands(check)).toContain("corepack enable");
    expect(check).not.toMatch(/pnpm\/action-setup/);
  });

  it("installs, lints, typechecks, tests and checks the schemas, in that order", () => {
    const steps = [
      "pnpm install --frozen-lockfile",
      "pnpm lint",
      "pnpm typecheck",
      "pnpm test",
      "pnpm schemas:check",
    ];
    const run = commands(job(workflow(), "check")).filter((command) => steps.includes(command));
    expect(run).toEqual(steps);
  });

  it("builds the relay image for arm64 on an arm64 runner", () => {
    const image = job(workflow(), "relay-image");
    expect(image).toMatch(/^ {4}runs-on: ubuntu-24\.04-arm$/m);
    expect(commands(image)).toEqual([
      "docker build --platform linux/arm64 --file services/relay/Dockerfile --tag discretion-relay .",
    ]);
  });

  it("checks out the repository in every job", () => {
    for (const name of ["check", "relay-image"]) {
      expect(job(workflow(), name), name).toMatch(/^ {6}- uses: actions\/checkout@v\d+$/m);
    }
  });

  it("gives the jobs read-only access to the repository", () => {
    expect(workflow()).toMatch(/^permissions:\n {2}contents: read\n/m);
  });
});

describe("relay image", () => {
  const dockerfile = () => read("services/relay/Dockerfile");

  it("builds every stage from the pinned Node 22", () => {
    const bases = [...dockerfile().matchAll(/^FROM (\S+)/gm)].map((match) => match[1]);
    expect(bases.length).toBeGreaterThan(0);
    for (const base of bases) {
      expect(base).toBe("node:22-bookworm-slim");
    }
  });

  it("installs from the frozen lockfile with the pinned pnpm", () => {
    expect(dockerfile()).toMatch(/^RUN corepack enable$/m);
    expect(dockerfile()).toMatch(/^RUN pnpm install --frozen-lockfile$/m);
  });

  it("compiles the relay and ships only its production files", () => {
    expect(dockerfile()).toMatch(/^RUN pnpm exec tsc -b services\/relay$/m);
    expect(dockerfile()).toMatch(/^RUN pnpm --filter @discretion\/relay deploy --prod \S+$/m);
  });

  it("does not run as root", () => {
    expect(dockerfile()).toMatch(/^USER node$/m);
  });

  it("keeps installed and generated files out of the build context", () => {
    const ignored = read(".dockerignore").split("\n");
    for (const entry of [".git", "**/node_modules", ".pnpm-store", "**/dist", "**/*.tsbuildinfo"]) {
      expect(ignored, entry).toContain(entry);
    }
  });
});
