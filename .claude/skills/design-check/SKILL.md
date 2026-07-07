---
name: design-check
description: Verify UI code against the financieel locked design system. ALWAYS run after creating or modifying any component, page, or styling — including "quick" UI tweaks — and before declaring frontend work done. Catches drift from the Monarch-style design language (typography weights, colors, card styles, dark mode) that reviews keep missing.
---

# Design System Check

The design system is locked (owner-approved). Deviations need explicit approval, not taste.
Check every file changed in this session that renders UI.

## The rules

| Element | Required |
|---|---|
| Page background | `bg-stone-50` (with dark-mode variant) |
| Cards | `bg-white border border-stone-200 rounded-2xl p-5` |
| Hero numbers | `text-3xl font-medium tracking-tight` — **`font-bold`/`font-semibold` on hero numbers is a violation** |
| Tiny labels | `text-[11px] uppercase tracking-wider text-gray-400` |
| Accent | coral `#D85A30` |
| Positive / negative | `#3B6D11` / `#A32D2D` |
| Primary buttons | `bg-gray-900` |
| Charts | inline SVG only — importing a chart library is a violation |
| Icons | lucide-react only |
| Dark mode | every new element handles the ThemeContext dark theme |
| Budget hints | grey hint only for fixed/capped wallets with non-zero budget; never render "€0" |

## Procedure

1. `git diff --name-only` (or session file list) → filter to `.jsx` files under `src/`.
2. Grep each for violations: stray `font-bold`/`font-semibold` on large text, hardcoded colors
   outside the palette, `rounded-lg`/`rounded-xl` on cards, chart library imports, missing
   dark-mode classes on new containers.
3. If a browser tool is available, screenshot the affected pages in **both** light and dark
   mode and eyeball against the rules.
4. Report violations with file:line and the fix; apply fixes if in scope, otherwise list them.

Note: when the planned full redesign (feature d) lands, this skill's table is the file to
update — the skill stays, the tokens change.
