# Editing the Roots templates

This file is for an agent that changes the note templates in `1-Roots/_roots/templates/`. Read it fully before you edit. Everything here is checked by `discretion roots template check`.

## What you may change

Each note kind has one template, `daily.md`, `weekly.md`, `monthly.md`, `quarterly.md`, `yearly.md` and `home.md`. A template is ordinary Markdown holding the note as Roots defines it. You may add, remove, reorder or rename sections, change headings and wording, and add your own text, as long as you keep what the rest of this file says must stay.

Launchers in `_roots/launchers/` are never edited. They hold one line, `<% await tp.user.roots(tp) %>`, which is how Obsidian reaches the renderer. `_roots/scripts/roots.js` is generated code and is never edited either. Install restores both.

Template edits apply to notes created after the edit. Existing notes are never re-rendered; to bring an old note in line with the current template, use `discretion roots repair <note-or-date> [--dry-run]`.

## Placeholders

The renderer fills these and copies everything else as written. An unknown placeholder renders as visible text and is an error in the check.

| Placeholder        | Filled with                                                                 |
| ------------------ | --------------------------------------------------------------------------- |
| `{{frontmatter}}`  | The whole frontmatter block, fences included. Keep it on the first line.    |
| `{{title}}`        | The note's title text. The template writes the `#` before it.               |
| `{{links}}`        | The line linking the neighbouring notes. Empty for `home`.                  |
| `{{date}}`         | The note's date, `YYYY-MM-DD`; for a period note, the period's first day.   |
| `{{question}}`     | The day's prompt from `questions.md`.                                       |
| `{{query:<name>}}` | One complete `dataviewjs` block. `<name>` is one of the names listed below. |

Query names: `{{query:ratings-bars}}`, `{{query:ratings-trend}}`, `{{query:logs}}`, `{{query:days}}`, `{{query:habits}}`, `{{query:heatmap}}`, `{{query:wheel-progression}}`, `{{query:notes-below}}`, `{{query:home-today}}`, `{{query:home-week}}`, `{{query:home-streaks}}` and `{{query:home-trend}}`.

## Marker pairs

Discretion's writers find their place only by these marker pairs, never by a heading or a position. Each marker is a line of its own, written exactly as shown. A pair must appear once, start before end.

| Pair                                                                          | Kinds                              | Written by       | If it is missing                         |
| ----------------------------------------------------------------------------- | ---------------------------------- | ---------------- | ---------------------------------------- |
| `<!-- discretion:journal:start -->` … `<!-- discretion:journal:end -->`       | daily                              | Pranshul         | Error: the text would stop being private |
| `<!-- discretion:habits:start -->` … `<!-- discretion:habits:end -->`         | daily                              | habit stamper    | Warning: the stamper skips the note      |
| `<!-- discretion:plan:start -->` … `<!-- discretion:plan:end -->`             | daily                              | planner          | Warning: the planner skips the note      |
| `<!-- discretion:captured:start -->` … `<!-- discretion:captured:end -->`     | daily                              | capture pipeline | Warning: the pipeline skips the note     |
| `<!-- discretion:pictures:start -->` … `<!-- discretion:pictures:end -->`     | daily                              | Pranshul         | Error: the text would stop being private |
| `<!-- discretion:qa:start -->` … `<!-- discretion:qa:end -->`                 | daily                              | Pranshul         | Error: the text would stop being private |
| `<!-- discretion:private:start -->` … `<!-- discretion:private:end -->`       | daily                              | Pranshul         | Error: the text would stop being private |
| `<!-- discretion:ribbon:start -->` … `<!-- discretion:ribbon:end -->`         | daily                              | tracker          | Warning: the tracker skips the note      |
| `<!-- discretion:summary:start -->` … `<!-- discretion:summary:end -->`       | weekly, monthly, quarterly, yearly | local model      | Error: the text would stop being private |
| `<!-- discretion:reflection:start -->` … `<!-- discretion:reflection:end -->` | weekly, monthly, quarterly, yearly | Pranshul         | Error: the text would stop being private |

`<!-- roots:quick-notes:end -->` is a single line in daily notes. The quick-note buttons and the capture pipeline insert above it. If it is missing they skip the note; the check warns.

The journal, pictures, qa, private, summary and reflection spans are private: the privacy filter keeps their text away from frontier models. A template that drops their markers would send that text out as ordinary text, which is why the check refuses it. Discretion writes only inside `habits`, `plan`, `captured`, `ribbon` and `summary`; the others are Pranshul's.

## Frontmatter

Use `{{frontmatter}}` and you get every key. If you write frontmatter by hand it must have these keys, at the left edge, with two-space indents and no tabs:

- daily: `roots` (always `1`), `date`, `rating`, `alias`, `aiRating`, `aiAlias`, `discretion`, `habits`, `habitTimes`, `habitMinutes`, `habitSource`, `skipReasons`. The first six hold a scalar or stay empty; `discretion` is `1`; the last five are maps.
- weekly: `roots`, `kind` (`weekly`), `from`, `to`, and `wheel`, a map with the eight areas health, career, relationships, finance, growth, recreation, social and spirituality, each empty until set.
- monthly, quarterly, yearly: `roots`, `kind`, `from`, `to`. They have no `wheel` key.
- home: `roots`, `kind` (`home`).

The recap queries read these keys and tags only. Changing headings or the order of sections never changes a recap.

## After every edit

Run `discretion roots template check` after every edit and fix what it reports. Pass a kind to check one template, and `--json` for a structured list:

```
discretion roots template check [<kind>] [--json]
```

It writes nothing. It reports unknown placeholders, removed, unbalanced, duplicated or malformed markers, unreadable frontmatter, edited launchers, and any failure of a trial render for today's date. Each problem names the file, the line and the fix. An error makes the command exit non-zero; removing an optional section is a warning.

To see what you changed against the shipped default, run `discretion roots template diff <kind>`. To put the shipped default back, run `discretion roots template reset <kind>`. Template edits are ordinary vault commits, so git shows what changed and when.
