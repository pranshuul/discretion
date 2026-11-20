type Edit = { op: " " | "-" | "+"; line: string };

/** The line-by-line edit script from `a` to `b`, from their longest common subsequence. */
function edits(a: string[], b: string[]): Edit[] {
  const table = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  const cell = (i: number, j: number): number => (table[i] as number[])[j] as number;
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      (table[i] as number[])[j] =
        a[i] === b[j] ? cell(i + 1, j + 1) + 1 : Math.max(cell(i + 1, j), cell(i, j + 1));
    }
  }
  const out: Edit[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      out.push({ op: " ", line: a[i] as string });
      i++;
      j++;
    } else if (j >= b.length || (i < a.length && cell(i + 1, j) >= cell(i, j + 1))) {
      out.push({ op: "-", line: a[i] as string });
      i++;
    } else {
      out.push({ op: "+", line: b[j] as string });
      j++;
    }
  }
  return out;
}

const context = 3;

/** The hunks of an edit script, with three lines of context around each change. */
function hunks(all: Edit[]): string[] {
  const keep = all.map((_, at) =>
    all.slice(Math.max(0, at - context), at + context + 1).some((e) => e.op !== " "),
  );
  const lines: string[] = [];
  let oldAt = 1;
  let newAt = 1;
  let at = 0;
  while (at < all.length) {
    if (!keep[at]) {
      const e = all[at] as Edit;
      if (e.op !== "+") oldAt++;
      if (e.op !== "-") newAt++;
      at++;
      continue;
    }
    const hunkOld = oldAt;
    const hunkNew = newAt;
    let oldCount = 0;
    let newCount = 0;
    const body: string[] = [];
    while (at < all.length && keep[at]) {
      const e = all[at] as Edit;
      body.push(`${e.op}${e.line}`);
      if (e.op !== "+") oldCount++;
      if (e.op !== "-") newCount++;
      at++;
    }
    oldAt += oldCount;
    newAt += newCount;
    lines.push(`@@ -${hunkOld},${oldCount} +${hunkNew},${newCount} @@`, ...body);
  }
  return lines;
}

const split = (text: string): string[] => {
  const lines = text.split("\n");
  if (lines[lines.length - 1] === "") lines.pop();
  return lines;
};

/** A unified diff from `before` to `after`; empty when they are equal. */
export function unifiedDiff(
  before: string,
  after: string,
  beforeLabel: string,
  afterLabel: string,
): string {
  if (before === after) return "";
  const body = hunks(edits(split(before), split(after)));
  return `--- ${beforeLabel}\n+++ ${afterLabel}\n${body.join("\n")}\n`;
}
