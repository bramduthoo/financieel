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
3. If a browser tool is available, screenshot the affected pages in **both** light and dark
   mode and eyeball against the rules — including every interactive control in each state.
4. Report violations with file:line and the fix; apply fixes if in scope, otherwise list them.

Note: the redesign ("the blend") has landed — this table is now the live token reference.
`DESIGN-SPEC.md` is the authority; keep this table in sync with it if the spec changes.
