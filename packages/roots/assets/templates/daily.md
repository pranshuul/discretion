{{frontmatter}}

# {{title}}

{{links}}

INPUT[text(placeholder(Name this day in a few words)):alias]

## Journal

<!-- discretion:journal:start -->

<!-- discretion:journal:end -->

## Habits

<!-- discretion:habits:start -->
<!-- discretion:habits:end -->

## Today's plan

<!-- discretion:plan:start -->
<!-- discretion:plan:end -->

## Quick notes

```meta-bind-button
label: Progress
style: default
actions:
  - type: inlineJS
    code: |
      const file = app.workspace.getActiveFile();
      await app.vault.process(file, (text) => {
        const end = "<!-- roots:quick-notes:end -->";
        const at = text.indexOf(end);
        return at < 0 ? text : text.slice(0, at) + " - #progress  \n" + text.slice(at);
      });
```

```meta-bind-button
label: Highlight
style: default
actions:
  - type: inlineJS
    code: |
      const file = app.workspace.getActiveFile();
      await app.vault.process(file, (text) => {
        const end = "<!-- roots:quick-notes:end -->";
        const at = text.indexOf(end);
        return at < 0 ? text : text.slice(0, at) + " - #highlight  \n" + text.slice(at);
      });
```

```meta-bind-button
label: Idea
style: default
actions:
  - type: inlineJS
    code: |
      const file = app.workspace.getActiveFile();
      await app.vault.process(file, (text) => {
        const end = "<!-- roots:quick-notes:end -->";
        const at = text.indexOf(end);
        return at < 0 ? text : text.slice(0, at) + " - #idea  \n" + text.slice(at);
      });
```

<!-- roots:quick-notes:end -->

## Captured

<!-- discretion:captured:start -->
<!-- discretion:captured:end -->

## Pictures

<!-- discretion:pictures:start -->

<!-- discretion:pictures:end -->

## Rating

INPUT[slider(minValue(1), maxValue(10), stepSize(1), addLabels):rating]

Suggested: `VIEW[{aiRating}]` · `VIEW[{aiAlias}]`

```meta-bind-button
label: Accept
style: primary
actions:
  - type: inlineJS
    code: |
      const file = app.workspace.getActiveFile();
      await app.fileManager.processFrontMatter(file, (fm) => {
        if (fm.aiRating !== null && fm.aiRating !== undefined && fm.aiRating !== "") fm.rating = fm.aiRating;
        if (fm.aiAlias) fm.alias = fm.aiAlias;
      });
```

## Question of the day

> {{question}}

<!-- discretion:qa:start -->

<!-- discretion:qa:end -->

## On this day

```dataviewjs
const [, mm, dd] = dv.current().date.toFormat("yyyy-MM-dd").split("-");
const here = dv.current().date.year;
const rows = dv
  .pages('"1-Roots/Daily"')
  .where((p) => p.date && p.date.year < here && p.date.toFormat("MM-dd") === `${mm}-${dd}`)
  .sort((p) => p.date, "desc");
if (rows.length === 0) dv.paragraph("Nothing yet: this is the first year.");
for (const p of rows) {
  const text = await dv.io.load(p.file.path);
  const highlights = text
    .split("\n")
    .filter((l) => /^\s*- #highlight\b/.test(l))
    .map((l) => l.replace(/^\s*- #highlight\s*/, "").trim());
  dv.header(4, `${p.date.year} — ${p.alias ?? "no alias"} (${p.rating ?? "–"}/10)`);
  if (highlights.length) dv.list(highlights);
}
```

## Private

<!-- discretion:private:start -->

<!-- discretion:private:end -->

## Day ribbon

<!-- discretion:ribbon:start -->

![[3-Mycelium/ribbons/{{date}}.svg]]
<!-- discretion:ribbon:end -->
