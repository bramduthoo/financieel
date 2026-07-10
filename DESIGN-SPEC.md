# DESIGN-SPEC.md — Financieel redesign ("the blend")

> Locked design language, approved by the owner on 2026-07-09 after mockup iteration
> (direction B structure × direction C warmth). This file is the single source of truth
> for the reskin rollout and, afterwards, for all new UI. The design-check skill's token
> table must be updated to match this file as part of rollout session R1.
>
> Scope of the redesign: **pure reskin.** Page structure, navigation structure (sidebar
> stays), flows, and information hierarchy are unchanged. The dashboard's content
> redesign is a separate later phase.

## 1. Principles

1. Warm neutral foundation; color is signal, not decoration. Saturated color appears
   only where it carries meaning (positive/negative, accent actions, wallet identity).
2. One hero number per screen. Everything else supports it.
3. Numbers are `font-medium tracking-tight` — never bold/semibold. This survives from
   the old system.
4. Structure through surfaces and hairlines, not shadows. No gradients, no glows.
5. Both themes are first-class. Every component ships light + dark together.

## 2. Color tokens

Define these as Tailwind theme extensions (tailwind.config) so classes read as
`bg-cream`, `text-ink`, etc. Exact hex values are locked.

### Light mode ("cream")
| Token | Hex | Use |
|---|---|---|
| `cream` (page bg) | `#F4F0E7` | page canvas |
| `card` | `#FFFFFF` | all cards/surfaces |
| `card-border` | `#E4DFD3` | 0.5–1px card hairlines |
| `inner-border` | `#ECE7DB` | dividers/nested-card borders inside cards |
| `field` | `#F7F4EC` | input backgrounds |
| `track` | `#F1EFE8` | progress-bar tracks |
| `ink` (text primary) | `#2C2C2A` | headings, numbers, primary buttons bg |
| `ink-soft` (secondary) | `#5F5E5A` | secondary text |
| `ink-muted` | `#888780` | labels, captions |
| `ink-faint` | `#B4B2A9` | hints (e.g. budget hints) |
| `accent` (coral) | `#D85A30` | logo mark, accent highlights, Unallocated amounts, active checkbox |
| `positive` | `#3B6D11` | positive amounts/text; bars use `#639922` |
| `positive-tint` | `#EAF3DE` | positive chip/badge backgrounds |
| `negative` | `#993C1D` | negative/spent icons & text (deep red-clay); `#A32D2D` allowed for strict error text |
| `negative-tint` | `#FAECE7` | negative chip backgrounds |

### Dark mode (direction B palette)
| Token | Hex | Use |
|---|---|---|
| page bg | `#14140F` | canvas; also nested-card bg inside cards |
| card | `#1E1E17` | cards/surfaces (separation by fill, not border; borders may be dropped or `#2C2C2A`) |
| track | `#2C2C2A` | progress tracks |
| text primary | `#F1EFE8` | |
| text secondary | `#B4B2A9` | |
| text muted | `#888780` | |
| accent text | `#F0997B` | coral shifted lighter for contrast; solid fills keep `#D85A30` |
| positive text | `#97C459` | shifted lighter (was #3B6D11 — too dark on black) |
| positive badge | bg `rgba(99,153,34,0.18)`, text `#97C459` | |
| negative text | `#F09595` | shifted lighter |
| negative badge | bg `rgba(226,75,74,0.15)`, text `#F09595` | |

Rule of thumb for any color not listed: on dark, move text/icons 2–3 stops LIGHTER on
the same ramp; keep solid fills the same; make tinted backgrounds a low-alpha version
of the ramp color instead of the pastel.

### Wallet identity ramps (icon chips, progress bars)
Each wallet gets a color family: chip bg = pastel stop, icon/bar = strong stop.
Light: green `#EAF3DE`/`#3B6D11` (bar `#639922`), blue `#E6F1FB`/`#185FA5` (bar
`#378ADD`), pink `#FBEAF0`/`#993556` (bar `#D4537E`), purple `#EEEDFE`/`#534AB7`
(bar `#7F77DD`), amber `#FAEEDA`/`#854F0B` (bar `#EF9F27`).
Dark: chip bg = same hue at ~18% alpha; icon = the bar stop or lighter.
Map existing wallet `colour` values onto these families; do not invent new hues.

## 3. Typography

- Hero numbers: 36px (`text-4xl`-ish), `font-medium tracking-tight`, decimals may be
  de-emphasized (muted, smaller).
- Card numbers: 15–20px `font-medium`.
- Section labels: 11–12px, uppercase, `tracking-wider`, `ink-muted`.
- Body/rows: 13–14px regular.
- Never `font-bold`/`font-semibold` on numbers. Two weights total: 400 and 500.

## 4. Components

- **Cards:** bg `card`, border 0.5–1px `card-border`, `rounded-[14px]`, padding ~24px
  (dense cards 20px). Nested cards inside cards: border `inner-border`, `rounded-[11px]`.
- **Icon chips:** 28–36px square, `rounded-[9px]`, pastel bg + strong icon per the
  wallet/semantic ramp. Icons: lucide-react (the mockups used a different icon set;
  map to nearest lucide equivalents: Home, ShoppingCart, TrendingUp, PiggyBank,
  ArrowDownLeft, ArrowUpRight, PartyPopper/Sparkles, Wallet).
- **Progress bars:** 5–6px tall, `rounded-full`, bg `track`, fill = wallet/semantic color.
- **Buttons:** primary = bg `ink`, white text, `rounded-[9px]`, 13px; secondary =
  transparent, 0.5px border `#D3D1C7`, text `ink-soft`. Dark: primary = bg `#F1EFE8`,
  text `#14140F`.
- **Badges/pills:** tint bg + matching deep text (light) or alpha bg + light text
  (dark), `rounded-full`, 12px, may carry a small icon.
- **Inputs:** bg `field`, border `card-border`, `rounded-[8px]`, right-aligned for
  amounts.
- **Segmented €/% toggles:** pill group, active segment bg `ink` white text.
- **Checkbox (sweep):** filled `accent` square with white check.
- **Sidebar (kept from current app):** reskin only. Light: bg `card`, right hairline
  `card-border`, coral logo mark (28px rounded square `accent` + white Wallet icon),
  active item = bg `ink` white text `rounded-[9px]`, inactive `ink-muted` with icon.
  Dark: bg `#1E1E17`, active item bg `#F1EFE8` text `#14140F`. Collapse behavior
  unchanged.
- **DistributionPopup:** panel bg `cream` (not white) so its white cards read as
  grouped sections; wallets grouped by type under uppercase labels; per-row €/%
  toggles; sweep checkbox; **two TOTAL progress bars exactly as current behavior —
  one euro, one percent** (owner explicitly rejected a segmented per-wallet bar);
  footer right-aligned Cancel + Confirm.

## 5. Money formatting (rollout requirement)

Create `src/lib/format.js` exporting `formatMoney(amount, opts)` producing European
format `€ 1.234,56`. ALL (~22) inline `€{n.toFixed(2)}` call sites route through it.
This is a redesign requirement because it (a) standardizes number rendering and
(b) unblocks the deferred privacy-mode feature and any future currency work.
Behaviour tests accompany it.

## 6. Charts

Inline SVG only (unchanged rule). Recolor to spec: axis/gridlines `ink-faint`/`track`,
positive fill `#639922` family, negative `#E24B4A` family, dashed zero baseline kept.

## 7. design-check table (replaces the old one in .claude/skills/design-check/SKILL.md)

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
