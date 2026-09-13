# AUDIT-BRIEF-ADDENDUM.md — review interfaces & structure-review default

> Commit to `docs/audit/AUDIT-BRIEF-ADDENDUM.md`.
> Add this line to `AUDIT-BRIEF.md` §3: *"See also AUDIT-BRIEF-ADDENDUM.md — required."*
> Applies from SESSION 2 onward. Session 1 is unaffected.

---

## 1. Amendment to SESSION 4 — structure review

Replace the session's stance with the following.

**The default verdict is "no change needed."** The repository uses a conventional
Vite + React layout that is appropriate for its size. Reorganisation is not an
improvement by default; it is a large diff with real risk, in a project with a
documented history of a merge that passed the build and still crashed at runtime.

`STRUCTURE-REVIEW.md` must therefore **open with an explicit verdict, before any
proposals**, in this form:

```
## Verdict
Root & docs hygiene:  CHANGE NEEDED / NO CHANGE NEEDED
src/ structure:       CHANGE NEEDED / NO CHANGE NEEDED
```

Rules:

- If either verdict is `NO CHANGE NEEDED`, write no decision blocks for it. Say why in
  two or three sentences and stop. This is a good outcome, not a failure to find work.
- Any `src/` proposal must name **a concrete problem the owner would actually notice** —
  a file too large to work in, an import cycle, a genuine misfiling that has already
  caused a mistake. "Cleaner", "more idiomatic", "better separation of concerns" and
  "industry standard" are not problems. If you cannot name the symptom, there is no
  proposal to make.
- State the cost of every `src/` proposal honestly: how many files the import rewrite
  touches, and what it does to any branch not yet merged.
- Root and docs hygiene is judged **separately and to a lower bar** — moving a plan file
  into `docs/` breaks nothing and needs no burden of proof beyond tidiness.

**Independence:** the file deletions in Sessions 2–3 do not depend on this session at
all. Never make a cleanup proposal conditional on a structure decision, and never defer
a deletion because a possible future move might affect it.

---

## 2. Review interfaces (new requirement)

Every session that produces a decision file must **also** produce a self-contained HTML
review interface for it.

| Session | Markdown (canonical) | Interface |
|---|---|---|
| 2 | `CLEANUP-PROPOSAL.md` | `cleanup-review.html` |
| 4 | `STRUCTURE-REVIEW.md` | `structure-review.html` (only if any verdict is CHANGE NEEDED) |
| 5 | `DOCS-PROPOSAL.md` | `docs-review.html` |
| 6 | `QUESTIONNAIRE.md` | `questionnaire.html` |

**The markdown file remains canonical.** It is what gets committed, diffed and kept. The
HTML is an input device only. Both are generated from the same source data, and they must
never disagree — generate the markdown first, then build the HTML from the same content.

### The write-back loop

A page opened from `file://` cannot write to disk. Close the loop like this:

1. Claude Code writes the `.md` and the `.html`. Items are embedded directly in the HTML
   as a JavaScript data structure — no fetch, no external files, no network.
2. The owner opens the `.html` by double-clicking it and works through the items.
3. The page autosaves to `localStorage` continuously.
4. When done (or partway), the owner clicks **Export**, which downloads a JSON file
   (`cleanup-decisions.json`, `questionnaire-answers.json`, etc.).
5. The owner moves that file into `docs/audit/`.
6. The next Claude Code session reads the JSON, **merges the decisions back into the
   canonical `.md`**, reports what it read back, and only then acts.

The JSON, not the edited markdown, is what gets parsed. Never ask the owner to hand-edit
markdown when an interface exists for that file.

If the owner prefers, editing the markdown directly per `AUDIT-BRIEF.md` §3 remains valid
and must keep working. The interface is an addition, never a replacement.

### Hard requirements for every interface

- **One file, fully self-contained.** All CSS and JS inline. No CDN, no imports, no network
  requests of any kind. It must work offline, forever, opened from disk.
- **`localStorage` is required, not forbidden.** The rule against browser storage applies
  to chat artifacts, not to a local file. Autosave on every change, keyed per document
  (e.g. `financieel-audit-cleanup-v1`) so two interfaces never collide. Restore silently on
  open and show when the last save happened.
- **Never lose work.** Warn on close if there are unexported changes. Offer Export at all
  times, not only at the end. Include a "copy to clipboard" fallback in case the download
  is blocked.
- **Export is resumable and partial.** Exporting halfway must produce a valid file the
  session can read; unanswered items are simply absent. There is no submit step.
- **Import.** Accept a previously exported JSON to restore state on another machine or
  after clearing storage.
- **Keyboard first.** At 100+ items the mouse is the bottleneck. `j`/`k` to move, number
  keys to set a decision, `/` to search, `Enter` into the notes field, `Esc` out. Show the
  shortcuts on screen.
- **Progress always visible.** Decided / undecided / total, and a filter for "show only
  undecided" so a second sitting starts where the first stopped.
- **Show the reasoning.** Every item renders its full context, evidence, `file:line`
  references, options and your recommendation. The interface must not summarise the
  markdown — a decision made from a truncated description is worse than one made from a
  text file.
- **Style it with the project's own design tokens.** Read `DESIGN-SPEC.md` and use the real
  palette, type scale and card treatment, light and dark. This costs almost nothing and
  makes the interface feel like part of the project rather than a generated tool.

### Additional requirements — `questionnaire.html`

This is the one that carries the most weight, and it will be used across several sittings.

- **Free-text answers**, textarea, autosizing, not a fixed one-line input. Some answers
  will be a paragraph.
- Where a question offers options, render them as selectable **and** keep the free-text box
  open — the owner will often pick (b) *and* qualify it.
- **Priority badges** (MUST / SHOULD / NICE) with a filter, plus a "MUST only" mode so the
  blocking questions can be cleared in one sitting.
- **Section navigation** with per-section progress, and honour the "start here" list from
  the spec as its own filter.
- **Conditional questions:** when an answer makes a later question irrelevant, grey it out
  and mark it skipped automatically. State which answer caused it.
- A **"needs thought"** flag distinct from unanswered, so the owner can move past a hard
  question without losing it.
- **Answer length is never constrained.** No character limits, no truncation on export.
