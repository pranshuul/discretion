# Roots: the journal design

Roots is Discretion's own journal. It is written from scratch for Discretion: every template, query, script, stylesheet rule and prompt below is original, and nothing in it is taken from any other vault or plugin pack. This file is the contract the renderer, the installer and the golden files are built against. The Build Plan's Roots section is its source; where this file is more detailed, it fills in a choice the plan leaves open and the plan still wins on any conflict.

Roots is a periodic-notes journal: daily notes roll up into weekly, monthly, quarterly and yearly recaps. It needs three open-source Obsidian plugins (Templater, Dataview, Meta Bind) and nothing else.

## Notes and paths

All paths are under `1-Roots/`. Dates are the local calendar date, weeks are ISO weeks (Monday first), and the same path rules apply in Obsidian and headlessly.

| Note      | Path                          | Created                                                            |
| --------- | ----------------------------- | ------------------------------------------------------------------ |
| Daily     | `Daily/YYYY/MM/YYYY-MM-DD.md` | 00:05 by the habit stamper, or from Obsidian                       |
| Weekly    | `Weekly/YYYY/YYYY-[W]WW.md`   | Monday 00:05; `YYYY` is the ISO week-year, `WW` is zero-padded     |
| Monthly   | `Monthly/YYYY/YYYY-MM.md`     | The 1st, 00:05                                                     |
| Quarterly | `Quarterly/YYYY/YYYY-[Q]Q.md` | The quarter's first day, 00:05                                     |
| Yearly    | `Yearly/YYYY.md`              | 1 January, 00:05                                                   |
| Home      | `Roots.md`                    | At install: today's note, this week, current streaks, 30-day trend |

`_roots/` holds the machinery:

```
_roots/
  templates/{daily,weekly,monthly,quarterly,yearly,home}.md   each note kind's template, a real Markdown file
  scripts/roots.js            the renderer bundle (CommonJS), loaded by Templater as a user script
  questions.md                the 366 prompts of the Question list, one per day of the year
  roots.css                   the CSS snippet defined under Colours
```

The six note templates hold each note as this file defines it, with the placeholders listed under Templates; Pranshul edits them in Obsidian. `roots.js` receives the note kind from the template it was run from (`daily.md` gives `daily`), and the date from the note being created, which is today unless the command names another date.

## Plugins

| Plugin    | Used for                                                                       |
| --------- | ------------------------------------------------------------------------------ |
| Templater | Creating notes inside Obsidian by calling the shared renderer                  |
| Dataview  | Every rollup, list, chart and heatmap (DQL and `dataviewjs`)                   |
| Meta Bind | The rating slider, alias input, weekly wheel sliders, habit inputs and buttons |

`discretion roots install` downloads each plugin from its official GitHub release at a pinned version, checks the SHA-256 of every file, and records the result in `~/vault/.discretion/plugins.lock.json`. It refuses on a hash mismatch (D2010). `discretion doctor` and `discretion roots status` flag drift. The `.obsidian` settings Roots needs are: Templater's template folder `1-Roots/_roots/templates` and user-script folder `1-Roots/_roots/scripts`, the core Daily notes plugin off, the `roots` CSS snippet on (install copies `_roots/roots.css` to `.obsidian/snippets/roots.css`, the only folder Obsidian reads snippets from), and the three plugins listed in `community-plugins.json` so Obsidian loads them. Install merges these into the files that are already there and keeps every other key.

The charts are `dataviewjs` blocks, so Roots also needs Dataview's JavaScript queries, a required setting the plan's install step must write too: `discretion roots install` writes Dataview's settings file, `.obsidian/plugins/dataview/data.json`, with `enableDataviewJs: true` and `enableInlineDataviewJs: true`, alongside the settings above. Other Dataview settings keep their defaults.

## Daily note

Every daily note has these parts, top to bottom. A heading line is written for each part so the note reads as a page; the content sits under it. Markers are listed under Marker rules.

### 1. Frontmatter

```yaml
---
roots: 1
date: 2026-11-05
rating:
alias:
aiRating:
aiAlias:
discretion: 1
habits: {}
habitTimes: {}
habitMinutes: {}
habitSource: {}
skipReasons: {}
---
```

`roots` is the schema marker, `date` the note's date, `rating` an integer 1–10 that stays empty until set, `alias` a few words naming the day, `aiRating` and `aiAlias` the local model's nightly suggestions. The keys from `discretion: 1` down are the `roots/1` keys Discretion owns: `habits` maps habit id to `pending`, `done`, `delayed`, `skipped` or `missed` (`delayed` is done, but after the habit's `due` or window end plus its `late_after_min`); `habitTimes` maps a check habit's id to the local `HH:MM` it was marked done, from which `done` and `delayed` follow (a habit with neither `due` nor window never becomes `delayed`); `habitMinutes` maps quantity-habit ids to minutes; `habitSource` maps them to `timed` or `self-reported`; `skipReasons` maps habit ids to the reason given when skipped. The first five keys above are written empty; the renderer never writes a value Pranshul or the AI should supply.

### 2. Title and links

```markdown
# Thursday 5 November 2026

[[1-Roots/Daily/2026/11/2026-11-04|← Yesterday]] · [[1-Roots/Weekly/2026/2026-W45|This week]] · [[1-Roots/Daily/2026/11/2026-11-06|Tomorrow →]]
```

The title is the weekday name, day number, month name and year. The links use full paths so they resolve before the target exists.

### 3. Alias input

One line: `INPUT[text(placeholder(Name this day in a few words)):alias]`.

### 4. Journal

Free writing, Pranshul's own. The section is empty when created.

```markdown
## Journal

<!-- discretion:journal:start -->

<!-- discretion:journal:end -->
```

### 5. Habits

```markdown
## Habits

<!-- discretion:habits:start -->
<!-- discretion:habits:end -->
```

The habit stamper writes one line per habit due that day between the markers. A check habit with no time is `- Gym INPUT[inlineSelect(option(pending), option(done), option(skipped), option(missed)):habits.gym]`. A time-bound check habit, one with a `due` time or a window, adds the `delayed` option and a time input for when it was done:

```markdown
- Took morning meds INPUT[inlineSelect(option(pending), option(done), option(delayed), option(skipped), option(missed)):habits.meds-morning] at INPUT[time:habitTimes.meds-morning]
```

Untimed check habits omit the time input. A quantity habit is `- Build or study for 3 hours INPUT[number:habitMinutes.deep-work]` and has neither the reason input nor the time input.

The "why skipped?" input appears only on a skipped habit's line. Meta Bind cannot show an input conditionally, so Discretion rewrites that one line inside the `habits` markers whenever the habit's state becomes `skipped` (a Telegram tap, a `habit-report` capture, or a mark made in Obsidian and noticed by the laptop's file watcher), adding `INPUT[text(placeholder(why skipped?)):skipReasons.gym]` after the select, and removes it again when the state changes away from `skipped`:

```markdown
- Gym INPUT[inlineSelect(option(pending), option(done), option(skipped), option(missed)):habits.gym] INPUT[text(placeholder(why skipped?)):skipReasons.gym]
```

The rewrite touches only that habit's line, keeps the select's value and does nothing if the markers are missing. The reason stays in `skipReasons` either way; recaps show it in the hover text of that habit's skipped cell, and it is private (never sent to frontier models). A tap in Obsidian and a tap in Telegram change the same frontmatter key, so recaps read one source. The renderer writes the empty marker pair only.

### 6. Today's plan

```markdown
## Today's plan

<!-- discretion:plan:start -->
<!-- discretion:plan:end -->
```

Rewritten after every replan from `plans/YYYY-MM-DD.json`, one line per block: `- 10:00–10:45 [[tsk_…|title]] (deep technical, 45/10)`. Read-only: edits here are overwritten. The renderer writes the empty marker pair only.

### 7. Quick notes

````markdown
## Quick notes

```meta-bind-button
(the Progress, Highlight and Idea buttons, see Buttons)
```

<!-- roots:quick-notes:end -->
````

Lines are inserted directly above the `<!-- roots:quick-notes:end -->` line. Each line starts with `- #progress `, `- #highlight ` or `- #idea ` (leading space, tag, two trailing spaces). A capture classified as progress, idea or highlight is inserted the same way as `- #progress <text> #captured ^cap-20261105-x2b8pd`.

### 8. Captured

```markdown
## Captured

<!-- discretion:captured:start -->
<!-- discretion:captured:end -->
```

One receipt line per capture filed that day: `- 09:41 Created task [[tsk_…|title]] ^cap-20261105-x2b8pd`.

### 9. Pictures

```markdown
## Pictures

<!-- discretion:pictures:start -->
<!-- discretion:pictures:end -->
```

Embeds (`![[photo.jpg]]`) go between the markers. Private.

### 10. Rating

```markdown
## Rating

INPUT[slider(minValue(1), maxValue(10), stepSize(1), addLabels):rating]

Suggested: `VIEW[{aiRating}]` · `VIEW[{aiAlias}]`
(the Accept button, see Buttons)
```

The slider is bound to `rating`. The suggestion line shows the night's `aiRating` and `aiAlias` and is followed by the Accept button.

### 11. Question of the day

```markdown
## Question of the day

> The prompt for this date, from `_roots/questions.md`

<!-- discretion:qa:start -->

<!-- discretion:qa:end -->
```

The prompt is picked by the day-of-year rule in the Question list, and quoted into the note as text when the note is created, so later edits to `questions.md` do not change old notes. The answer goes between the markers.

### 12. On this day

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

Only the alias, rating and Highlight lines of earlier days are shown; the journal, private and answer spans are never read by this query.

### 13. Private

```markdown
## Private

<!-- discretion:private:start -->

<!-- discretion:private:end -->
```

Written only by Pranshul. Discretion never writes here, and nothing in it leaves the laptop.

### 14. Day ribbon

```markdown
## Day ribbon

<!-- discretion:ribbon:start -->

![[3-Mycelium/ribbons/2026-11-05.svg]]
<!-- discretion:ribbon:end -->
```

The tracker renders the SVG each evening and after each Stop; the note only embeds it. The embed is written when the note is created and stays valid before the file exists.

## Weekly note

Frontmatter: `roots: 1`, `kind: weekly`, `from` and `to` (the Monday and Sunday, `YYYY-MM-DD`), and `wheel:` with the eight areas, each empty until set. The title is `# Week 45, 2026` followed by a link to the previous and next week and the months it touches. Sections, top to bottom, each under a `##` heading of the same name:

### Ratings

The average rating of the week's rated days, then one bar per day (the Ratings query). Unrated days show a grey stub.

### Logs

Three lists, Progress, Highlights and Ideas, gathered by tag from the week's daily notes, each line followed by a link to its day (the Logs query).

### Days

One line per day with its alias and rating, linked to the daily note (the Days query).

### Habits

A habit-by-day grid with each habit's streak, its completion count and, for time-bound habits, the median delay on delayed days (the Habits query). Done reads `6/7 (5 on time)` when some days were delayed.

### Wheel of Life

Eight sliders, one per area, each bound to `wheel.<area>` in this note's frontmatter (see Wheel of Life).

### Summary

```markdown
## Summary

<!-- discretion:summary:start -->

<!-- discretion:summary:end -->
```

Written by the local model when the week ends; empty until then.

### Reflection

```markdown
## Reflection

<!-- discretion:reflection:start -->

What went well this week?

What got in the way?

What will I do differently next week?

<!-- discretion:reflection:end -->
```

Three prompts, with room under each for Pranshul's answer.

## Monthly note

Frontmatter: `roots: 1`, `kind: monthly`, `from`, `to` (first and last day of the month); there is no `wheel` key. Title `# November 2026`, with links to the previous and next month and the year. The sections are the same seven as the weekly note and in the same order, over the month's days, with these differences. Ratings shows the rating trend (the Ratings query's `trend` mode, one point per day) instead of a bar per day. Habits shows a calendar heatmap per habit with its completion percentage, and its on-time percentage and median delay when some days were delayed, instead of the grid (the Heatmap query). Wheel of Life has no inputs: it shows each area's value per week, computed from the weekly notes (the Wheel progression query). The Reflection prompts say "month" for "week".

### Ratings

As above, trend mode.

### Logs

As above, over the month.

### Days

As above, over the month.

### Habits

A heatmap and completion percentage per habit.

### Wheel of Life

The Wheel progression, one column per week of the month.

### Summary

`discretion:summary` markers, written by the local model when the month ends.

### Reflection

`discretion:reflection` markers, same three prompts.

## Quarterly note

Frontmatter: `roots: 1`, `kind: quarterly`, `from`, `to`; no `wheel` key. Title `# 2026 Q4`, with links to the previous and next quarter. The sections are those of the monthly note, over the quarter's days, with the Wheel progression showing each area's average of the weekly values per month, and one added section, Notes below, between Wheel of Life and Summary.

### Ratings

Trend mode over the quarter.

### Logs

Over the quarter.

### Days

Over the quarter.

### Habits

A heatmap and completion percentage per habit.

### Wheel of Life

The Wheel progression, one column per month of the quarter.

### Notes below

The Summary of each monthly note in the quarter, in date order (the Notes below query).

### Summary

`discretion:summary` markers, written by the local model when the quarter ends.

### Reflection

`discretion:reflection` markers, same three prompts with "quarter".

## Yearly note

Frontmatter: `roots: 1`, `kind: yearly`, `from`, `to`; no `wheel` key. Title `# 2026`, with links to the previous and next year. The sections are those of the quarterly note, over the year's days, with the Wheel progression showing each area's average of the weekly values per quarter, and Notes below listing the Summary of each quarterly note.

### Ratings

Trend mode over the year.

### Logs

Over the year.

### Days

Over the year.

### Habits

A heatmap and completion percentage per habit.

### Wheel of Life

The Wheel progression, one column per quarter of the year.

### Notes below

The Summary of each quarterly note in the year, in date order.

### Summary

`discretion:summary` markers, written by the local model when the year ends.

### Reflection

`discretion:reflection` markers, same three prompts with "year".

## Home note

`Roots.md` is created once, at install, from `_roots/templates/home.md` (an edited home template is used as it stands), and never rendered again, so everything that depends on the date is a query that runs when the note is opened. Frontmatter is `roots: 1` and `kind: home`. Top to bottom, each part after the title under a `##` heading of the same name:

1. `# Roots`.
2. **Today**: links to today's note and this week's note, then today's alias, rating and the state of each habit. One block: Home preamble with `range` `"today"`, then the Today body.
3. **This week**: the current ISO week's average and a bar per day. One block: Home preamble with `range` `"week"`, then Rating chart, then the Ratings body with `mode` `"bars"`.
4. **Streaks**: each habit's current streak, ending today. One block: Home preamble with `range` `"all"`, then Streak, then the Streaks body.
5. **30-day rating trend**: the last 30 days, today included. One block: Home preamble with `range` `"30 days"`, then Rating chart, then the Ratings body with `mode` `"trend"`.

The snippets are under Recap queries. Home has no frontmatter range; the Home preamble computes `from` and `to` from today instead.

## Buttons

All buttons are Meta Bind buttons that act on the note they sit in.

The three quick-note buttons differ only in label and tag:

````markdown
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
````

````markdown
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
````

````markdown
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
````

The inserted text is exactly one of `` ` - #progress  ` ``, `` ` - #highlight  ` `` or `` ` - #idea  ` `` followed by a newline, directly above the end marker. The cursor is left to Pranshul.

The Accept button copies the night's suggestions into the real fields and changes nothing else; Discretion never does this itself:

````markdown
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
````

Home has no buttons. The recap notes have none.

## Recap queries

Every query in a note is one `dataviewjs` block that the renderer assembles from the snippets below, joined by a blank line: a preamble first (Preamble in recap notes, Home preamble in `Roots.md`), then the helpers the body calls (Rating chart, Streak), then the body. Which blocks each note holds is listed under its note kind; the table gives each body's helpers.

| Body              | Helpers      | Used in                                        | Placeholder                                                                                        |
| ----------------- | ------------ | ---------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Ratings           | Rating chart | Every recap; Home's This week and 30-day trend | `{{query:ratings-bars}}`, `{{query:ratings-trend}}`, `{{query:home-week}}`, `{{query:home-trend}}` |
| Logs              | —            | Every recap                                    | `{{query:logs}}`                                                                                   |
| Days              | —            | Every recap                                    | `{{query:days}}`                                                                                   |
| Habits            | Streak       | Weekly                                         | `{{query:habits}}`                                                                                 |
| Heatmap           | —            | Monthly, quarterly, yearly                     | `{{query:heatmap}}`                                                                                |
| Wheel progression | —            | Monthly, quarterly, yearly                     | `{{query:wheel-progression}}`                                                                      |
| Notes below       | —            | Quarterly, yearly                              | `{{query:notes-below}}`                                                                            |
| Today             | —            | Home                                           | `{{query:home-today}}`                                                                             |
| Streaks           | Streak       | Home                                           | `{{query:home-streaks}}`                                                                           |

Ratings in monthly, quarterly and yearly notes and in Home's 30-day trend is the Ratings body with `mode` set to `"trend"`; Home's four blocks use the Home preamble with `range` set to `"today"`, `"week"`, `"all"` and `"30 days"`, in the order of the Home note's parts.

Days are the daily notes whose `date` lies in the range, oldest first. Dataview reads `date`, `from` and `to` as dates.

### Preamble

The recap notes' preamble reads the note's own range from its `from` and `to`.

```js
const cur = dv.current();
const from = dv.date(cur.from);
const to = dv.date(cur.to);
const today = dv.date("today");
const days = dv
  .pages('"1-Roots/Daily"')
  .where((p) => p.date && p.date >= from && p.date <= to)
  .sort((p) => p.date, "asc")
  .array();
```

### Home preamble

Home's preamble computes the range from today. The renderer sets `range` per block: `"today"` is today alone, `"week"` is the current ISO week from Monday to Sunday, `"30 days"` is today and the 29 days before it, and `"all"` is every daily note up to today.

```js
const today = dv.date("today");
const range = "week";
const from = {
  today: today,
  week: today.minus({ days: today.weekday - 1 }),
  "30 days": today.minus({ days: 29 }),
  all: null,
}[range];
const to = range === "week" ? from.plus({ days: 6 }) : today;
const days = dv
  .pages('"1-Roots/Daily"')
  .where((p) => p.date && (from === null || p.date >= from) && p.date <= to)
  .sort((p) => p.date, "asc")
  .array();
```

### Rating chart

`ratingChart(points, mode)` returns the SVG for a list of `{ label, rating }`, one per day, oldest first, with `rating` `null` when the day is unrated. Ratings run from 1 at the bottom to 10 at the top, inside a 5-unit margin.

- `"bars"`: one bar per day, 28 units wide, so the viewBox is 28 units per day. An unrated day is a short grey stub.
- `"trend"`: the viewBox is always 360 by 100 and the days are spread evenly across it, the first at the left margin and the last at the right, however many there are. Rated days are joined by a line and each has a dot, so a single rated day still shows; unrated days leave a gap in the spacing but no point.

```js
const ratingChart = (points, mode) => {
  const H = 100;
  const pad = 5;
  const y = (r) => pad + ((10 - r) * (H - 2 * pad)) / 9;
  const title = (p) => `<title>${p.label}: ${p.rating ?? "–"}</title>`;
  if (mode === "bars") {
    const W = 28;
    const bars = points.map((p, i) =>
      p.rating === null
        ? `<rect x="${i * W + 4}" y="${H - 4}" width="${W - 8}" height="4" class="roots-pending">${title(p)}</rect>`
        : `<rect x="${i * W + 4}" y="${y(p.rating)}" width="${W - 8}" height="${H - y(p.rating)}" class="roots-bar">${title(p)}</rect>`,
    );
    return `<svg class="roots-chart" viewBox="0 0 ${Math.max(points.length, 1) * W} ${H}" width="100%">${bars.join("")}</svg>`;
  }
  const width = 360;
  const x = (i) =>
    points.length > 1 ? pad + (i * (width - 2 * pad)) / (points.length - 1) : width / 2;
  const rated = points.flatMap((p, i) =>
    p.rating === null ? [] : [{ p, x: x(i).toFixed(1), y: y(p.rating).toFixed(1) }],
  );
  const line =
    rated.length > 1
      ? `<polyline points="${rated.map((r) => `${r.x},${r.y}`).join(" ")}" class="roots-line"/>`
      : "";
  const dots = rated.map(
    (r) => `<circle cx="${r.x}" cy="${r.y}" r="3" class="roots-dot">${title(r.p)}</circle>`,
  );
  return `<svg class="roots-chart" viewBox="0 0 ${width} ${H}" width="100%">${line}${dots.join("")}</svg>`;
};
```

### Ratings

The average of the range's rated days, then the chart. `mode` is `"bars"` in weekly notes and Home's This week, and the renderer writes `"trend"` in monthly, quarterly and yearly notes and Home's 30-day trend.

```js
const mode = "bars";
const rated = days.filter((p) => typeof p.rating === "number");
const average = rated.length ? rated.reduce((s, p) => s + p.rating, 0) / rated.length : null;
dv.paragraph(
  average === null
    ? "No ratings yet."
    : `Average rating: **${average.toFixed(1)}** over ${rated.length} days`,
);
dv.el(
  "div",
  ratingChart(
    days.map((p) => ({
      label: p.date.toFormat("ccc d LLL"),
      rating: typeof p.rating === "number" ? p.rating : null,
    })),
    mode,
  ),
);
```

### Logs

Progress, Highlights and Ideas, gathered by tag from the range's daily notes. The `#captured` tag and block id of captured lines are dropped from the shown text, and empty lines left by an unused button are skipped.

```js
const kinds = [
  ["Progress", "progress"],
  ["Highlights", "highlight"],
  ["Ideas", "idea"],
];
for (const [title, tag] of kinds) {
  dv.header(4, title);
  const out = [];
  for (const p of days) {
    const text = await dv.io.load(p.file.path);
    const re = new RegExp(`^\\s*- #${tag}\\b\\s*(.*)$`);
    for (const line of text.split("\n")) {
      const m = re.exec(line);
      if (m && m[1].trim())
        out.push(`${m[1].replace(/\s+#captured.*$/, "").trim()} — ${p.file.link}`);
    }
  }
  dv.list(out.length ? out : ["Nothing logged."]);
}
```

### Days

```js
dv.table(
  ["Day", "Alias", "Rating"],
  days.map((p) => [p.file.link, p.alias ?? "", p.rating ?? ""]),
);
```

### Streak

`streak(states, openLast)` counts a habit's current streak from its state on each day, oldest first, with `undefined` for days it was not due. Walking back from the last day, `done` and `delayed` each add one (a late done still counts), a day it was not due is passed over, and anything else ends the streak: `missed`, `skipped`, or `pending` on a day that is over. `openLast` is true when the last day is today; its `pending` is passed over, since the day is not over yet.

```js
const streak = (states, openLast) => {
  let n = 0;
  for (let i = states.length - 1; i >= 0; i--) {
    const s = states[i];
    if (s === "done" || s === "delayed") n++;
    else if (s === undefined || (s === "pending" && openLast && i === states.length - 1)) continue;
    else break;
  }
  return n;
};
```

### Habits

The weekly grid: one row per habit and one cell per day, coloured by state (a day the habit was not due is grey like the future), then the streak over the days up to today, then the completion count, `done` and `delayed` days over days the habit was stamped, written `6/7 (5 on time)` when some of them were delayed, then the median delay of the habit's delayed days.

A cell's hover text is its date and state; for a `delayed` day it also gives the time and how late, as in `done 11:05, 2 h late`; for a skipped day it gives the reason, as in `skipped — travelling`. How late is measured against the habit's `due` time, or the end of its `window`, which the query reads from `3-Mycelium/config/habits.toml`; a habit with neither has no delay to measure, so its delayed days say `done 12:00, late` and its median delay is blank. A delay under an hour is written in minutes, otherwise in hours.

```js
const clock = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
const dueAt = {};
let section = null;
for (const raw of (await dv.io.load("3-Mycelium/config/habits.toml")).split("\n")) {
  const line = raw.trim();
  const head = /^\[habits\.([^\]]+)\]$/.exec(line);
  if (head) section = head[1];
  else if (line.startsWith("[")) section = null;
  const set = section ? /^(due|window)\s*=\s*(.*)$/.exec(line) : null;
  const times = set ? set[2].match(/\d\d:\d\d/g) : null;
  if (times) dueAt[section] = clock(set[1] === "due" ? times[0] : times[times.length - 1]);
}
const lateBy = (id, p) => {
  const t = (p.habitTimes ?? {})[id];
  return typeof t === "string" && /^\d\d:\d\d$/.test(t) && dueAt[id] !== undefined
    ? clock(t) - dueAt[id]
    : null;
};
const span = (m) => (m < 60 ? `${m} min` : `${Math.round(m / 60)} h`);
const median = (xs) => {
  const sorted = [...xs].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};
const escape = (text) =>
  String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
const hover = (id, p, s) => {
  if (s === "delayed") {
    const t = (p.habitTimes ?? {})[id];
    const late = lateBy(id, p);
    if (!t) return "delayed";
    return late === null ? `done ${t}, late` : `done ${t}, ${span(Math.max(late, 0))} late`;
  }
  if (s === "skipped") {
    const reason = (p.skipReasons ?? {})[id];
    if (reason) return `skipped — ${reason}`;
  }
  return s ?? "not due";
};
const ids = [...new Set(days.flatMap((p) => Object.keys(p.habits ?? {})))].sort();
const known = ["pending", "done", "delayed", "skipped", "missed"];
const past = days.filter((p) => p.date <= today);
const openLast = past.length > 0 && +past[past.length - 1].date === +today;
const rows = ids.map((id) => {
  const cells = days.map((p) => {
    const s = (p.habits ?? {})[id];
    const state = known.includes(s) ? s : "future";
    return `<span class="roots-cell roots-${state}" title="${escape(`${p.date.toFormat("ccc d LLL")}: ${hover(id, p, s)}`)}"></span>`;
  });
  const n = streak(
    past.map((p) => (p.habits ?? {})[id]),
    openLast,
  );
  const stamped = days.filter((p) => (p.habits ?? {})[id]).length;
  const done = days.filter((p) => (p.habits ?? {})[id] === "done").length;
  const late = days.filter((p) => (p.habits ?? {})[id] === "delayed");
  const delays = late.map((p) => lateBy(id, p)).filter((m) => m !== null);
  return [
    id,
    cells.join(""),
    n,
    `${done + late.length}/${stamped}${late.length ? ` (${done} on time)` : ""}`,
    delays.length ? span(Math.round(median(delays))) : "",
  ];
});
dv.table(["Habit", "Days", "Streak", "Done", "Median delay"], rows);
```

### Heatmap

Used instead of the grid in monthly, quarterly and yearly notes: one calendar per habit, seven rows (Monday first) by one column per week, and the completion percentage in the heading. Completion counts `done` and `delayed` days; when some days were delayed the heading also gives the on-time percentage and, where the habit has a `due` time or window in `3-Mycelium/config/habits.toml`, the median delay, as in `meds — 67% (33% on time), median delay 2 h`. A cell's hover text follows the same rules as the Habits grid.

```js
const clock = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
const dueAt = {};
let section = null;
for (const raw of (await dv.io.load("3-Mycelium/config/habits.toml")).split("\n")) {
  const line = raw.trim();
  const head = /^\[habits\.([^\]]+)\]$/.exec(line);
  if (head) section = head[1];
  else if (line.startsWith("[")) section = null;
  const set = section ? /^(due|window)\s*=\s*(.*)$/.exec(line) : null;
  const times = set ? set[2].match(/\d\d:\d\d/g) : null;
  if (times) dueAt[section] = clock(set[1] === "due" ? times[0] : times[times.length - 1]);
}
const lateBy = (id, p) => {
  const t = (p.habitTimes ?? {})[id];
  return typeof t === "string" && /^\d\d:\d\d$/.test(t) && dueAt[id] !== undefined
    ? clock(t) - dueAt[id]
    : null;
};
const span = (m) => (m < 60 ? `${m} min` : `${Math.round(m / 60)} h`);
const median = (xs) => {
  const sorted = [...xs].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};
const escape = (text) => String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;");
const hover = (id, p, s) => {
  if (s === "delayed") {
    const t = (p.habitTimes ?? {})[id];
    const late = lateBy(id, p);
    if (!t) return "delayed";
    return late === null ? `done ${t}, late` : `done ${t}, ${span(Math.max(late, 0))} late`;
  }
  if (s === "skipped") {
    const reason = (p.skipReasons ?? {})[id];
    if (reason) return `skipped — ${reason}`;
  }
  return s ?? "not due";
};
const ids = [...new Set(days.flatMap((p) => Object.keys(p.habits ?? {})))].sort();
for (const id of ids) {
  const stamped = days.filter((p) => (p.habits ?? {})[id]);
  const done = stamped.filter((p) => p.habits[id] === "done").length;
  const late = stamped.filter((p) => p.habits[id] === "delayed");
  const pct = (n) => (stamped.length ? Math.round((100 * n) / stamped.length) : 0);
  const delays = late.map((p) => lateBy(id, p)).filter((m) => m !== null);
  let heading = `${id} — ${pct(done + late.length)}%`;
  if (late.length) heading += ` (${pct(done)}% on time)`;
  if (delays.length) heading += `, median delay ${span(Math.round(median(delays)))}`;
  const byDate = new Map(days.map((p) => [p.date.toFormat("yyyy-MM-dd"), p]));
  const first = from.minus({ days: from.weekday - 1 });
  const cells = [];
  for (let d = first; d <= to; d = d.plus({ days: 1 })) {
    const col = Math.floor(d.diff(first, "days").days / 7);
    const p = d >= from ? byDate.get(d.toFormat("yyyy-MM-dd")) : undefined;
    const s = p ? (p.habits ?? {})[id] : undefined;
    const state = s ?? "future";
    cells.push(
      `<rect x="${col * 14}" y="${(d.weekday - 1) * 14}" width="12" height="12" rx="2" class="roots-${state}"><title>${escape(`${d.toFormat("d LLL")}: ${hover(id, p, s)}`)}</title></rect>`,
    );
  }
  const weeks = Math.ceil((to.diff(first, "days").days + 1) / 7);
  dv.header(4, heading);
  dv.el(
    "div",
    `<svg class="roots-chart" viewBox="0 0 ${weeks * 14} 98" width="${Math.min(weeks * 14, 720)}">${cells.join("")}</svg>`,
  );
}
```

### Wheel progression

Used in monthly, quarterly and yearly notes, which have no wheel inputs of their own. Every value comes from the weekly notes' `wheel.<area>`. A week belongs to the period that contains its Thursday (the ISO 8601 rule; see Wheel of Life), so a week that straddles two months, quarters or years counts once. The columns are the periods of the note: each ISO week whose Thursday falls in the month (labelled `W45`), each month of the quarter (`Oct`), or each quarter of the year (`Q1`). A cell is the average of that area over the weeks in the column that have a value, rounded to one decimal; a cell with no value is blank, not zero.

```js
const areas = [
  "health",
  "career",
  "relationships",
  "finance",
  "growth",
  "recreation",
  "social",
  "spirituality",
];
const periods = [];
if (cur.kind === "monthly") {
  for (
    let thursday = from.plus({ days: (11 - from.weekday) % 7 });
    thursday <= to;
    thursday = thursday.plus({ days: 7 })
  )
    periods.push({ label: thursday.toFormat("'W'WW"), start: thursday, end: thursday });
} else {
  const months = cur.kind === "quarterly" ? 1 : 3;
  for (let start = from; start <= to; start = start.plus({ months }))
    periods.push({
      label: cur.kind === "quarterly" ? start.toFormat("LLL") : start.toFormat("'Q'q"),
      start,
      end: start.plus({ months }).minus({ days: 1 }),
    });
}
const weeks = dv
  .pages('"1-Roots/Weekly"')
  .where((p) => p.from)
  .array()
  .map((p) => ({ wheel: p.wheel ?? {}, thursday: dv.date(p.from).plus({ days: 3 }) }));
const cell = (period, area) => {
  const values = weeks
    .filter((w) => w.thursday >= period.start && w.thursday <= period.end)
    .map((w) => w.wheel[area])
    .filter((v) => typeof v === "number");
  if (!values.length) return "";
  return Math.round((10 * values.reduce((s, v) => s + v, 0)) / values.length) / 10;
};
dv.table(
  ["Area", ...periods.map((x) => x.label)],
  areas.map((a) => [a, ...periods.map((x) => cell(x, a))]),
);
```

### Notes below

Used in quarterly and yearly notes. It quotes each lower note's Summary span by reading the file text between its markers.

```js
const sub = cur.kind === "quarterly" ? "Monthly" : "Quarterly";
const notes = dv
  .pages(`"1-Roots/${sub}"`)
  .where((p) => p.from && dv.date(p.from) >= from && dv.date(p.to) <= to)
  .sort((p) => p.from, "asc")
  .array();
for (const p of notes) {
  const text = await dv.io.load(p.file.path);
  const m = /<!-- discretion:summary:start -->([\s\S]*?)<!-- discretion:summary:end -->/.exec(text);
  dv.header(4, p.file.link);
  dv.paragraph(m && m[1].trim() ? m[1].trim() : "No summary yet.");
}
```

### Today

Home's Today block. The week link uses the ISO week-year, which differs from the calendar year in the first and last days of some years.

```js
const day = `1-Roots/Daily/${today.toFormat("yyyy/MM/yyyy-MM-dd")}`;
const week = `1-Roots/Weekly/${today.toFormat("kkkk")}/${today.toFormat("kkkk-'W'WW")}`;
dv.paragraph(`[[${day}|Today's note]] · [[${week}|This week]]`);
const p = days[0];
if (!p) {
  dv.paragraph("Today's note has not been created yet.");
} else {
  dv.paragraph(`${p.alias || "No alias yet"} · rating ${p.rating ?? "–"}/10`);
  const habits = Object.entries(p.habits ?? {}).sort(([a], [b]) => (a < b ? -1 : 1));
  if (habits.length) dv.table(["Habit", "State"], habits);
}
```

### Streaks

Home's Streaks block: every habit stamped on any day, with its current streak ending today.

```js
const ids = [...new Set(days.flatMap((p) => Object.keys(p.habits ?? {})))].sort();
const openLast = days.length > 0 && +days[days.length - 1].date === +today;
if (!ids.length) dv.paragraph("No habits stamped yet.");
else
  dv.table(
    ["Habit", "Streak"],
    ids.map((id) => [
      id,
      streak(
        days.map((p) => (p.habits ?? {})[id]),
        openLast,
      ),
    ]),
  );
```

## Wheel of Life

Eight areas, in this order: health, career, relationships, finance, growth, recreation, social, spirituality.

Only weekly notes have inputs. A weekly note has one slider per area, bound to the matching `wheel.<area>` key in its own frontmatter, and the key stays empty until Pranshul sets it:

```markdown
Health INPUT[slider(minValue(1), maxValue(10), stepSize(1), addLabels):wheel.health]
Career INPUT[slider(minValue(1), maxValue(10), stepSize(1), addLabels):wheel.career]
Relationships INPUT[slider(minValue(1), maxValue(10), stepSize(1), addLabels):wheel.relationships]
Finance INPUT[slider(minValue(1), maxValue(10), stepSize(1), addLabels):wheel.finance]
Growth INPUT[slider(minValue(1), maxValue(10), stepSize(1), addLabels):wheel.growth]
Recreation INPUT[slider(minValue(1), maxValue(10), stepSize(1), addLabels):wheel.recreation]
Social INPUT[slider(minValue(1), maxValue(10), stepSize(1), addLabels):wheel.social]
Spirituality INPUT[slider(minValue(1), maxValue(10), stepSize(1), addLabels):wheel.spirituality]
```

```yaml
wheel:
  health:
  career:
  relationships:
  finance:
  growth:
  recreation:
  social:
  spirituality:
```

Monthly, quarterly and yearly notes have no wheel inputs and no `wheel` key. Their Wheel of Life section is the Wheel progression query, computed from the weekly notes: a monthly note shows one value per week, a quarterly note one per month and a yearly note one per quarter, each the average of that area's weekly values over the period. An area with no weekly value in a period is blank, not zero.

A week belongs to the month, and so to the quarter and year, that contains its Thursday, the ISO 8601 rule, so every week counts exactly once. Week 2026-W44 (26 October to 1 November) belongs to October; week 2026-W53 (28 December 2026 to 3 January 2027, which holds 1 January 2027) belongs to December 2026 and to the year 2026.

Wheel of Life values are public to frontier models.

## Colours

`roots.css` is the CSS snippet. It defines the colours every chart uses and the classes the queries emit:

```css
body {
  --roots-done: #3f9d5a;
  --roots-delayed: #8fc79a;
  --roots-skipped: #d9a21b;
  --roots-missed: #cf4a46;
  --roots-pending: #9aa0a6;
  --roots-future: #c9cdd1;
  --roots-bar: #4a78c2;
}
.roots-chart rect.roots-done,
.roots-cell.roots-done {
  fill: var(--roots-done);
  background: var(--roots-done);
}
.roots-chart rect.roots-delayed,
.roots-cell.roots-delayed {
  fill: var(--roots-delayed);
  background: var(--roots-delayed);
}
.roots-chart rect.roots-skipped,
.roots-cell.roots-skipped {
  fill: var(--roots-skipped);
  background: var(--roots-skipped);
}
.roots-chart rect.roots-missed,
.roots-cell.roots-missed {
  fill: var(--roots-missed);
  background: var(--roots-missed);
}
.roots-chart rect.roots-pending,
.roots-cell.roots-pending {
  fill: var(--roots-pending);
  background: var(--roots-pending);
}
.roots-chart rect.roots-future,
.roots-cell.roots-future {
  fill: var(--roots-future);
  background: var(--roots-future);
}
.roots-chart rect.roots-bar {
  fill: var(--roots-bar);
}
.roots-chart .roots-line {
  fill: none;
  stroke: var(--roots-bar);
  stroke-width: 2;
}
.roots-chart .roots-dot {
  fill: var(--roots-bar);
}
.roots-cell {
  display: inline-block;
  width: 12px;
  height: 12px;
  margin-right: 2px;
  border-radius: 2px;
}
```

Done is green, delayed (done, but late) pale green, skipped amber, missed red, pending and future grey.

## One renderer

`packages/roots` holds one function, `render(kind, date, ctx)`, which returns a note's full text for `kind` in `daily`, `weekly`, `monthly`, `quarterly`, `yearly` or `home`. The build bundles it into `_roots/scripts/roots.js`, a CommonJS file Templater loads as a user script. The renderer reads the note kind's template, `_roots/templates/<kind>.md`, and fills its placeholders (Templates), so Obsidian and `discretion roots new <kind> [date]` run the same code and write identical bytes. `ctx` supplies what the renderer may not read itself: the question list, the per-note data (such as yesterday's links) and nothing from the clock.

If a note already exists it is never rendered again; Discretion edits only its own markers and frontmatter keys. Rendering is deterministic: the same `kind`, `date` and `ctx` give the same bytes, with `\n` line endings and a final newline.

## Templates

Each note kind's template is a real Markdown file, `_roots/templates/<kind>.md`, that Pranshul edits in Obsidian. It holds the note as this file defines it, and the shared renderer fills a small fixed set of placeholders; everything else is copied as written:

| Placeholder        | Filled with                                                             |
| ------------------ | ----------------------------------------------------------------------- |
| `{{frontmatter}}`  | The whole frontmatter block, fences included                            |
| `{{title}}`        | The note's title text (the template writes the `#` before it)           |
| `{{links}}`        | The line linking the neighbouring notes                                 |
| `{{date}}`         | The note's date, `YYYY-MM-DD`                                           |
| `{{question}}`     | The day's prompt from `questions.md`                                    |
| `{{query:<name>}}` | One complete `dataviewjs` block: the query's preamble, helpers and body |

The query names are the Recap queries' bodies, and the table under Recap queries says which helpers each one carries. `{{query:ratings-bars}}` and `{{query:ratings-trend}}` are the Ratings body with `mode` `"bars"` and `"trend"`; `{{query:logs}}`, `{{query:days}}`, `{{query:habits}}`, `{{query:heatmap}}`, `{{query:wheel-progression}}` and `{{query:notes-below}}` are the bodies of the same names; and Home's four blocks are `{{query:home-today}}`, `{{query:home-week}}`, `{{query:home-streaks}}` and `{{query:home-trend}}`. Each note kind's default template holds the queries its section lists, in that order.

Adding, removing, reordering or renaming a section is an edit to that file. Templater still runs the same renderer, so Obsidian and `discretion roots new` give identical bytes from the same template. The golden files pin the shipped default templates. Template edits apply to notes created after the edit; existing notes are never re-rendered.

**Nothing depends on position or headings.** Every Discretion writer (the habit stamper, the planner, the capture pipeline, the tracker, the summariser) finds its place only by its marker pair. If a note lacks the pair, the writer skips that note and logs it, and `discretion doctor` lists it; it never fails, guesses a position or writes elsewhere. Recap queries read only frontmatter and tags, so changing headings or the order of sections never changes a recap. An unknown placeholder renders as visible text, `{{like this}}`, plus a `discretion doctor` warning, not an error.

**Defaults.** Install writes the default templates once and never overwrites an edited one; the same holds for `questions.md`, `roots.css` and `Roots.md`. `discretion roots status` lists a template or file that is missing; an edited one is Pranshul's own and is not drift.

## Marker rules

A marker pair is two HTML comment lines on their own lines, `<!-- discretion:NAME:start -->` and `<!-- discretion:NAME:end -->`. Discretion rewrites only the text between a pair it owns; Pranshul's text outside any pair is never touched. The pairs and who writes inside them:

| Name         | Appears in       | Written by                          |
| ------------ | ---------------- | ----------------------------------- |
| `journal`    | Daily            | Pranshul                            |
| `habits`     | Daily            | The habit stamper                   |
| `plan`       | Daily            | The planner, after every replan     |
| `captured`   | Daily            | The capture pipeline                |
| `pictures`   | Daily            | Pranshul                            |
| `qa`         | Daily            | Pranshul                            |
| `private`    | Daily            | Pranshul                            |
| `ribbon`     | Daily            | The tracker                         |
| `summary`    | Weekly and above | The local model, when the note ends |
| `reflection` | Weekly and above | Pranshul                            |

The Quick notes section uses a single line, `<!-- roots:quick-notes:end -->`, that the buttons and the capture pipeline insert above. Discretion's own text goes only inside `habits`, `plan`, `captured`, `ribbon` and `summary`; `journal`, `pictures`, `qa`, `private` and `reflection` are Pranshul's and Discretion never writes in them.

Here is each pair as it appears in a note:

```markdown
<!-- discretion:journal:start -->
<!-- discretion:journal:end -->
<!-- discretion:habits:start -->
<!-- discretion:habits:end -->
<!-- discretion:plan:start -->
<!-- discretion:plan:end -->
<!-- discretion:captured:start -->
<!-- discretion:captured:end -->
<!-- discretion:pictures:start -->
<!-- discretion:pictures:end -->
<!-- discretion:qa:start -->
<!-- discretion:qa:end -->
<!-- discretion:private:start -->
<!-- discretion:private:end -->
<!-- discretion:ribbon:start -->
<!-- discretion:ribbon:end -->
<!-- discretion:summary:start -->
<!-- discretion:summary:end -->
<!-- discretion:reflection:start -->
<!-- discretion:reflection:end -->
```

## Privacy spans

The privacy filter treats these as private in Roots: the `discretion:journal`, `discretion:pictures`, `discretion:qa`, `discretion:private`, `discretion:reflection` and `discretion:summary` spans, every embedded image or media file, the `skipReasons` frontmatter key and `aiAlias`. Everything else (habits, plan, Quick notes, Captured, rating, alias, Wheel of Life) is public to frontier models, which the config expresses as `1-Roots/**#public`. A note derived from private content carries `private: true` in its frontmatter and is treated as private as a whole. The local model may read everything; public sessions never see Roots.

## Question list

`_roots/questions.md` carries one prompt per day of the year, 366 in all, numbered 1 to 366 and written for Roots. The prompt for a date is found by its position in a leap year: 1 January is 1, 29 February is 60, 1 March is 61 in every year, and 31 December is 366. The list below is the content of `questions.md`, in order.

1. What is one thing you want to be true of this year by its last day?
2. Which small habit would change the most if you kept it for a year?
3. What did you postpone yesterday that you could start in ten minutes?
4. Who would you like to hear from this month, and what stops you from writing first?
5. What does a good ordinary day look like for you right now?
6. Which promise to yourself have you quietly dropped?
7. What are you pretending not to know?
8. Where did your attention go first this morning, and was that a choice?
9. What is the next smallest step on the thing that scares you?
10. Which room, desk or app do you avoid, and why?
11. What would you do today if nobody were ever going to see it?
12. What do you owe yourself an apology for?
13. Which skill would you like to be embarrassingly good at in five years?
14. What is draining you that you could stop doing this week?
15. Whose work do you admire most right now, and what exactly do you admire in it?
16. What did you learn from the last thing that went wrong?
17. Which belief about money did you inherit without choosing it?
18. What would make tomorrow feel like a win?
19. When did you last feel fully absorbed in something?
20. What is a question you keep circling without answering?
21. Which conversation are you rehearsing in your head?
22. What would you tell a friend who described your week to you?
23. What is one thing you can do for your body today that you will thank yourself for?
24. Which part of your work do you still enjoy when nobody is watching?
25. What are you waiting for permission to do?
26. What does enough look like, for this season of your life?
27. Who has helped you lately without being asked?
28. What is a rule you follow that nobody ever asked you to?
29. Which of your habits are really reactions to stress?
30. What do you want to remember about this stretch of January?
31. What would you try if failing were free?
32. What did you eat, read or watch recently that you would recommend, and why?
33. Which task keeps moving to tomorrow, and what is it really asking of you?
34. What are three things within arm's reach that you are grateful for?
35. Where do you feel tension in your body right now?
36. What is one old idea of yours worth another look?
37. How did you spend the hour you felt most awake yesterday?
38. What is the kindest thing you could say to yourself this evening?
39. Which of your possessions do you never use and could pass on?
40. What does your calendar say you value, compared with what you say you value?
41. What do you want to be doing at this time next week?
42. Who is waiting on something from you?
43. What tiny irritation could you fix permanently today?
44. Which of your strengths are you leaning on too hard?
45. What is your current definition of rest?
46. Where did you say yes when you meant no?
47. What was the best part of yesterday, and can you repeat any of it?
48. What would your ideal Tuesday include?
49. What is something you understand now that you did not a year ago?
50. Which question would you ask your future self?
51. What are you avoiding because it might turn out to be easy?
52. What does your inbox say about your priorities?
53. What small ritual makes a morning feel like yours?
54. Which commitment would you gladly let go of?
55. What did you notice on your last walk?
56. What is a thing you do well that you rarely credit yourself for?
57. Which relationship deserves more of your time than it gets?
58. What is the most useful thing you read this week?
59. What do you want your workspace to feel like?
60. What is hardest to say out loud right now?
61. Which decision are you postponing by collecting more information?
62. What does your body ask for that you keep refusing?
63. Whom do you want to thank, and for what, by the end of this week?
64. What would you want to have finished before the end of this month?
65. What are you proud of that nobody knows about?
66. Which mistake from last year still teaches you something?
67. What would you change about how you start your day?
68. What is a place you would like to see again, and what would you do there?
69. What is one thing you can simplify today?
70. Which of your goals is really someone else's?
71. What are you looking forward to in the next seven days?
72. What does your inner critic say most often, and is it ever right?
73. Which habit would a calmer version of you drop first?
74. What did you make this week, however small?
75. How do you want to feel at the end of today?
76. What would a gentler schedule look like?
77. Which promise to someone else is overdue?
78. What are you tolerating that you have the power to change?
79. What gave you energy yesterday, and what took it?
80. What is a small adventure you could fit in this weekend?
81. What would you do with an unexpected free afternoon?
82. Which of your fears has grown smaller since you first named it?
83. What are you learning right now, and where does it get hard?
84. Which part of your routine is there only out of habit?
85. Who do you want to be more like, and what specifically would you copy?
86. What is your favourite way to be useful to other people?
87. What do you need to hear today?
88. What is one thing you would like to stop explaining?
89. Which memory from childhood still shapes a choice you make?
90. What are you holding too tightly?
91. What did you do last month that you want to do again?
92. What is the most generous thing someone did for you recently?
93. What would you attempt if you were certain of support?
94. Which task would feel lighter if you started it badly?
95. What is a boundary you want to set this week?
96. What is on your mind right now that does not belong to today?
97. Which of your plans has room for surprise?
98. What do you want to know more deeply, and who could teach you?
99. What is something ordinary that you find beautiful?
100. Which of your recent choices felt most like you?
101. What is the next conversation worth having in person?
102. Which thing in your life is quietly working well?
103. What would you like to be known for, if anything?
104. How are you spending your attention, and is it a fair price?
105. What is one thing you would like to finish rather than start?
106. What would an honest status report on your month say?
107. What are you becoming good at without trying?
108. Which sound, smell or taste calms you most?
109. What are you rushing through that deserves time?
110. What is a risk you took that paid off, however small?
111. How do you respond when plans fall apart?
112. What would you like to ask someone older than you?
113. What would you like to tell someone younger?
114. Which book, film or song feels like it was written for this month?
115. What is the difference between busy and productive in your week?
116. What are you doing out of fear of missing out?
117. What gets easier when you do it first thing?
118. Where could you ask for help and have not?
119. What have you outgrown?
120. What is one thing you would put on a list of things to never do again?
121. What would you like your home to say about you?
122. Which part of today do you want to savour?
123. What do you want to do slowly?
124. Who makes you laugh, and when did you last see them?
125. What would a perfect hour alone look like?
126. What is something you are curious about this week?
127. Which of your values was tested lately?
128. What is the strongest feeling you have had in the past three days?
129. What did you do today that your past self would find unbelievable?
130. Where did you spend more than you meant to, in money or in time?
131. What do you want to preserve about how things are right now?
132. What is something you often say that you no longer mean?
133. Which small kindness could you do without being noticed?
134. What are you planning that depends on luck?
135. Which of your talents is going unused?
136. What does your best work need from the people around you?
137. What are you pretending is fine?
138. What is on your list that you would not do again if you had to pick afresh?
139. What would you do if you had one extra hour every day?
140. Which people feel like home?
141. What does the word enough mean to you today?
142. What would you like to be doing ten years from now, in an ordinary hour?
143. Which of your daily routines is kindest to you?
144. What would you stop apologising for?
145. What has surprised you about yourself this year?
146. What do you want to do before the weather changes?
147. What is a chore you secretly enjoy?
148. Which unfinished project still calls to you?
149. What would the calmest person you know do in your situation?
150. What do you owe to the person you will be next year?
151. Which of your opinions has changed lately?
152. What is the most important thing you will do today?
153. Where did you show up well this week?
154. What do you need less of?
155. What would you like more of?
156. Which comparison is costing you the most?
157. What do you wish you had said yesterday?
158. What is a belief you hold that you have never tested?
159. What do you do when you cannot decide?
160. What is a simple pleasure you have been ignoring?
161. Which of today's worries will matter in a month?
162. What is one thing you could automate, delegate or drop?
163. Which of your friendships has changed shape, and how do you feel about that?
164. What would you like to learn from someone you disagree with?
165. How do you know when you have done enough for the day?
166. What is a place in your city you have not visited?
167. What could you do this week to make next week easier?
168. What do you want your evenings to be for?
169. What would you like to see more of in your own work?
170. How does your body feel at the start of this month?
171. What is a habit you started and abandoned, and what did it teach you?
172. What is the most honest sentence you can write about this week?
173. Which of your commitments gives you the most in return?
174. What have you been meaning to fix for too long?
175. What is something you do automatically that deserves attention?
176. What would you like to hand over to someone else?
177. Which of your recent worries turned out to be nothing?
178. What do you want from the next hour?
179. What would you say to the person who taught you the most?
180. What is a small thing that made yesterday better?
181. Who do you trust with bad news, and when did you last tell them?
182. What are you learning to accept?
183. What would you do if you were less afraid of being seen?
184. Which idea would you like to give more time?
185. What does your ideal week look like when it is mostly unstructured?
186. What is one item you could cross off without doing it?
187. What is the difference between what you want and what you think you should want?
188. Where could you be more patient this week?
189. What is something that is better than you expected?
190. What do you wish more people understood about how you work?
191. What is an unglamorous task you are good at?
192. What are you ready to forgive?
193. Which dream have you kept in a drawer?
194. What time of day is truly yours?
195. Which of your standards could be lowered without harm?
196. What would you do differently if you trusted yourself more?
197. What question would unlock the problem in front of you?
198. What is a good use of ten spare minutes?
199. Which of your tools do you resent, and what would replace it?
200. What has been your best decision this year so far?
201. What would your younger self be surprised to see you doing?
202. Who do you want to introduce to someone else?
203. What is the weather doing, and how is it changing your mood?
204. What is a conversation that went better than you expected?
205. Which responsibility would you pick up again if you could?
206. What would you like to leave undone on purpose?
207. What is one thing that you want to do for the first time?
208. What is something you are saving for a special occasion that you could use now?
209. Which part of your body deserves a thank you?
210. What did you notice that nobody else seemed to?
211. What would be different if you were ten percent braver?
212. How do you want to be remembered by the people who see you daily?
213. What is the current chapter of your life called?
214. What do you need to forgive yourself for?
215. Which routines hold you together when everything else moves?
216. What would you like to practise until it is easy?
217. What is your favourite kind of silence?
218. Where are you more flexible than you think?
219. Which choice do you keep making by default?
220. What was the last thing you made with your hands?
221. How is your sleep, and what is it telling you?
222. Which part of your day would you give to a friend if you could?
223. What is a story you tell about yourself that may be out of date?
224. What would you like to ask for?
225. What is the most patient thing you have done lately?
226. Which of your habits are you proud of?
227. What would you tell yourself on the worst day of this year?
228. What are you grateful for that you only noticed today?
229. What is one assumption you made recently that turned out wrong?
230. Which person has changed how you think, and how?
231. What would a day without screens teach you?
232. What do you do when you feel stuck, and does it help?
233. What deserves a proper celebration?
234. What does your handwriting, or your typing, say about your mood today?
235. Which of your plans should be smaller?
236. What would make your commute, or your first walk, better?
237. What is something you could say yes to this week?
238. What is your most reliable source of calm?
239. What did you let go of this year that you do not miss?
240. What is worth being bored for?
241. Which problem would be easier with a different tool or a different question?
242. Whom do you miss?
243. What are you building that will outlast this season?
244. What does your future self need you to do today?
245. What advice do you give others that you do not follow?
246. Which small improvement would you notice every day?
247. What is a good question to ask over dinner?
248. Where do you feel most like yourself?
249. What did you learn about your limits recently?
250. What is a quiet win from this week?
251. What would you like to stop postponing joy for?
252. What is something you would like to do with a friend this month?
253. Which part of the year so far has been your best?
254. What would you cook, build or fix if you had the whole day?
255. What is the oldest unfinished thing on your list, and what would finishing it free up?
256. What do you want to be true about your work by the end of the year?
257. How do you want to treat your mistakes from here on?
258. What are you tired of carrying?
259. What is a place you go to think?
260. Which of your habits makes the biggest difference to your mood?
261. What would an extra day of rest do for you?
262. What is the best compliment you have received this year?
263. How do you tend to behave when you are tired, and what could you plan for it?
264. What is working better than you expected in your routine?
265. What is one thing you could do today that would make the weekend lighter?
266. What is a skill you use every day that you never learned on purpose?
267. Which of your goals has changed its shape since you set it?
268. What would you do if no one needed anything from you for a day?
269. Who would you like to get to know better?
270. What are you proud of finishing this season?
271. What would you like to improve in how you rest?
272. What is one way you could be kinder to your future self tonight?
273. What sights do you want to remember from this week?
274. Which tough conversation would be easier than the waiting?
275. What do you feel when you look at your to-do list, and why?
276. What is something you used to believe about work that you no longer do?
277. What are you curious about that has nothing to do with your goals?
278. What has been the loudest thought in your head today?
279. How have you changed since this time last year?
280. Which small act of courage did you perform this month?
281. What would you want to hear if you were struggling?
282. What is the best use of the next two hours?
283. What would you like your next birthday to look like?
284. Which plan would you cancel if you could?
285. What is something you did this week that was just for fun?
286. Who do you want to call?
287. What are the three most important things in your life right now?
288. What are you building toward, and is it still what you want?
289. Which of your possessions carries a story you want to keep?
290. What change are you resisting, and what might it give you?
291. What is one small act of order that would calm your space?
292. How does it feel to be you today?
293. What would you like to see finished by the end of the quarter?
294. What do you wish you had started a year ago?
295. What would a lighter version of your goals look like?
296. What do you want to remember about this autumn?
297. Which part of your day gives you the most energy?
298. What did you learn from someone who disagreed with you?
299. What makes a day feel complete?
300. Where do you feel pulled in two directions?
301. What are you most patient about, and what are you least patient about?
302. Which ritual would you like to begin this month?
303. What would you like to do before the year runs out?
304. What did you read this year that stayed with you?
305. Which habit would you recommend to your past self?
306. What are you afraid to want?
307. Who deserves a longer letter from you?
308. What have you been getting wrong about someone else?
309. Which part of this year do you want to repeat?
310. Which part do you want to leave behind?
311. What is the most useful thing you could do for someone today?
312. What would a perfect weekend contain?
313. Which of your plans for next year still feels alive?
314. What do you need to stop in order to start something better?
315. How have you looked after your attention this year?
316. What would you like to be better at listening to?
317. What is something you could do today that takes under five minutes and helps for weeks?
318. Which of your recent purchases earned its place?
319. What does a good apology from you look like?
320. Who in your life asks the best questions?
321. What would you change about your phone's home screen to match your intentions?
322. What have you been calling laziness that might be tiredness?
323. Which of your daily tasks would you do differently if you did it once a week?
324. What is the next book you want to read, and why that one?
325. Which part of your body of work are you quietly proud of?
326. What was the last time you changed your mind, and what changed it?
327. What does a good meeting leave behind?
328. What is one thing you want to ask a stranger?
329. Which meal do you most look forward to, and why?
330. What do you do well when you are under pressure?
331. What are you doing that a younger you would have loved?
332. What would you do on a day with no obligations and no money?
333. What does your to-do list leave out?
334. Which of your recent worries came from a story you told yourself?
335. What would you want to be doing if today were an ordinary last day of summer?
336. What is something you would like to say no to, kindly?
337. How could you make your hardest task more interesting?
338. Whom could you teach something this week?
339. What has your calendar protected, and what has it crowded out?
340. What is a simple rule that would improve your week?
341. What feels unfinished about yesterday?
342. What did you enjoy that you did not expect to?
343. What is a good boundary between work and the rest of your life?
344. How do you feel when you finish a hard task?
345. What is one thing about your daily life that you would show a visitor with pride?
346. Which of your friends would you trust with a secret, and why?
347. What are you doing to look after the people who look after you?
348. What do you want to understand better by the end of this month?
349. Which part of the past week do you want to keep?
350. What small thing could you do now so evening is easier?
351. What are you most looking forward to letting go of?
352. What kind of weather matches your mood today?
353. What does a good day off give you back?
354. What would you say to your inner critic if it were a colleague?
355. What would you like to be doing less of, without guilt?
356. What is something strange or lovely you saw today?
357. Which room in your life needs a clearing?
358. What are you saving that you should spend, whether time, money or words?
359. What did you do this year that surprised you?
360. Who showed you kindness this year, and have you said so?
361. What has been hardest this year, and what did it ask of you?
362. What has been easiest, and did you notice?
363. Which of your values led you well this year?
364. What would you like to carry into next year?
365. What would you like to put down before the year ends?
366. What are you grateful for tonight?
