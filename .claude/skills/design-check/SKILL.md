---
name: design-check
description: Verify UI code against the financieel locked design system. ALWAYS run after creating or modifying any component, page, or styling — including "quick" UI tweaks — and before declaring frontend work done. Catches drift from the Monarch-style design language (typography weights, colors, card styles, dark mode) that reviews keep missing.
---

# Design System Check

The design system is locked (owner-approved). Deviations need explicit approval, not taste.
Check every file changed in this session that renders UI.

## The rules

The redesign ("the blend") is the live system — tokens are defined in `src/index.css`
(`@theme` + `.dark` overrides) and specified in `DESIGN-SPEC.md`. Prefer the named token
utilities (`bg-cream`, `text-ink`, `text-positive`, `border-card-border`, …) over raw hex.

| Element | Required |
|---|---|
| Page background | `cream #F4F0E7` (dark `#14140F`) |
| Cards | white, 0.5–1px `#E4DFD3` border, `rounded-[14px]` (dark `#1E1E17`, fill-separated) |
| Hero numbers | 36px `font-medium tracking-tight` — bold/semibold on numbers is a violation |
| Section labels | 11–12px uppercase `tracking-wider` `#888780` |
| Accent | coral `#D85A30` (dark text-accents `#F0997B`) |
| Positive / negative text | light `#3B6D11` / `#993C1D`; dark `#97C459` / `#F09595` |
| Primary buttons | bg `#2C2C2A` white text (dark inverted) |
| Icon chips | pastel bg + strong icon from the same ramp |
| Progress bars | 5–6px, track `#F1EFE8`/`#2C2C2A` |
| Charts | inline SVG only — chart library import is a violation |
| Icons | lucide-react only |
| Dark mode | every element ships both themes; dark uses lighter text stops, alpha tints, fill separation |
| Money rendering | via `formatMoney()` — inline `toFixed` on amounts is a violation |
| Budget hints | grey hint only for fixed/capped wallets with non-zero budget; never render "€ 0" |
| Interactive controls | toggles/switches, active states, focus rings use **ink or coral** — `indigo`/`purple`/`violet` anywhere is a violation (not a spec color) |

### Density & completeness (DESIGN-SPEC §8 — the density pass)

| Element | Required |
|---|---|
| Content cards | hero 22px `font-medium tracking-tight` + `MetricBar` (5–6px) + 11px caption + `CardFooterMeta` (11px muted). **No empty bottom half.** Bar needs an honest denominator; investment / Unallocated cards omit the bar (no fabricated ratio) |
| Summary strip | every reworked page (except Settings) has a `SummaryStrip` under the header: 3–4 cells, 1px `inner-border` gaps, 11px uppercase label + 18px value, computed from that page's own data |
| Tables | 11px uppercase headers, amount hard-right in last column, zebra via `even:bg-field`, `Showing X of Y` footer, merged source+note cell, no dead-width column |
| Repeated items | `CompactRow` inside ONE card (28px chip + name + 11px meta + right value + `divide-y divide-inner-border`) — never individual large cards. Due recurring rows: amber "Log now" pill surfacing the existing flow (no new logic) |
| Settings | `max-w-[640px]`, three grouped section cards (Account / Preferences / Danger zone) as divider rows; danger zone `border-negative/40` + `text-negative` label. One-control-per-full-width-card is a violation |
| Grid remainders | `GhostAddCard` (`border-dashed border-card-border`) instead of empty space |
| Shared primitives | must import from `src/components/ui/` (`SummaryStrip`/`StatCell`, `CompactRow`, `GhostAddCard`, `CardFooterMeta`, `MetricBar`) — re-implementing one inline per page is a violation |

## Procedure

1. `git diff --name-only` (or session file list) → filter to `.jsx` files under `src/`.
   **Also scan the whole page/component tree a reskinned surface renders** (a reskinned page
   pulling in an un-migrated child — e.g. a `Toggle`, modal, or form — is how off-palette color
   reaches the screenshot). Do not scope the grep to only the top-level file you touched.
2. Grep each for violations. Run these explicitly and treat any hit as a finding:
   - `grep -nE "indigo|purple|violet|fuchsia"` → **purple leakage** (toggles, focus rings,
     buttons, active tabs). This is the pattern reviews keep missing — always run it.
   - `grep -nE "font-(bold|semibold)"` on large/number text.
   - `grep -nE "rounded-(lg|xl|2xl)"` on cards (should be `rounded-[14px]`).
   - hardcoded hex outside the DESIGN-SPEC palette; chart-library imports; containers missing a
     dark treatment (token utilities auto-theme; raw `bg-*`/`text-*` grays usually don't).
   - **Density (§8):** on reworked pages, confirm the shared primitives are imported from
     `src/components/ui/` (not re-implemented inline); every content card has hero+bar+caption+footer
     (no card ending in blank space); the page has a `SummaryStrip`; tables use `even:bg-field` zebra
     + `Showing X of Y`; repeated items are `CompactRow`s not big cards; grid remainders use
     `GhostAddCard`. Settings: `max-w-[640px]` + grouped section cards + `border-negative/40` danger
     zone. Investment/Unallocated cards must NOT render a progress bar (no honest denominator).
3. If a browser tool is available, screenshot the affected pages in **both** light and dark
   mode and eyeball against the rules — including every interactive control in each state.
4. Report violations with file:line and the fix; apply fixes if in scope, otherwise list them.

Note: the redesign ("the blend") has landed — this table is now the live token reference.
`DESIGN-SPEC.md` is the authority; keep this table in sync with it if the spec changes.
