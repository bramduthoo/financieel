# Financieel — Architecture & Project Reference

## Project Overview
A personal finance dashboard built for a single user (with multi-user support planned post-Phase 7).
Tracks income, fixed recurring costs, variable spending, and investments through a wallet-based system.

## Live URLs
- Production: https://financieel-sepia.vercel.app
- GitHub: https://github.com/bramduthoo/financieel
- Supabase project ID: duyttdjfvblhhjihybal

## Tech Stack
- **Frontend:** React 18 + Vite 8, deployed on Vercel
- **Styling:** Tailwind CSS (via @tailwindcss/vite plugin)
- **Routing:** React Router v6
- **Database & Auth:** Supabase (PostgreSQL), RLS enabled on all tables
- **Charts:** Inline SVG only — recharts removed due to Vite 8 + React 19 incompatibility
- **Icons:** lucide-react
- **Date handling:** date-fns
- **NO external chart libraries** — all charts are plain SVG elements

## Project Structure
```
src/
├── main.jsx
├── App.jsx                       # Root — routing + auth protection
├── index.css
├── lib/
│   ├── supabase.js               # Supabase client (single instance)
│   ├── recurringUtils.js         # Payment date generation for all frequencies
│   ├── distributeIncome.js       # Income distribution logic
│   └── dashboardCalcs.js         # Dashboard calculations (projections, alerts, trends)
├── pages/
│   ├── Login.jsx
│   ├── Dashboard.jsx             # Projected cash, outlook, alerts, performance, trends
│   ├── Wallets.jsx               # Wallet list with create/edit/delete
│   ├── Income.jsx                # Income page — history + add + recurring/template cards
│   ├── IncomeRecurringDetail.jsx # Recurring income detail + salary growth chart
│   ├── Settings.jsx              # General app settings
│   └── WalletDetail.jsx          # Individual wallet — layout differs by type
└── components/
    ├── Layout.jsx                # Sidebar + main content wrapper
    ├── WalletCard.jsx
    ├── WalletModal.jsx           # Create/edit wallet — includes cap reduction settings
    ├── DistributionPopup.jsx     # Reusable income distribution modal
    ├── RecurringRules.jsx        # Fixed wallet payment rules
    ├── TransactionChecklist.jsx  # Pending payments checklist (fixed wallets)
    ├── UpcomingPayments.jsx      # Table/calendar of upcoming payments (fixed wallets)
    ├── PaymentHistory.jsx        # Confirmed payment history (fixed wallets)
    ├── VariableTransactionForm.jsx
    ├── VariableTransactionList.jsx
    ├── WalletTrendsChart.jsx     # SVG trends chart (variable wallets)
    ├── IncomeSpendingChart.jsx   # SVG bar chart — income vs spending (dashboard trends)
    └── CashTrendChart.jsx        # SVG line chart — total cash over time (dashboard trends)
```

## Routing
| Path | Component | Protected |
|---|---|---|
| /login | Login.jsx | No |
| / | Dashboard.jsx | Yes |
| /wallets | Wallets.jsx | Yes |
| /wallets/:id | WalletDetail.jsx | Yes |
| /income | Income.jsx | Yes |
| /income/recurring/:id | IncomeRecurringDetail.jsx | Yes |
| /settings | Settings.jsx | Yes |

## Database Schema (Supabase / PostgreSQL)
RLS enabled on all tables. Policy: `for all using (auth.role() = 'authenticated')`

### wallets
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| name | text | |
| type | text | 'fixed', 'variable', 'investment', 'unallocated' |
| budget_type | text | 'fixed-recurring', 'accumulating', 'capped', 'none', 'unallocated' |
| budget | numeric(10,2) | monthly allocation / cap for capped wallets |
| balance | numeric(10,2) | running balance — starts at 0, can go negative |
| colour | text | hex colour |
| icon | text | |
| is_active | boolean | |
| is_system | boolean | true for Unallocated wallet — cannot be deleted or edited |
| sort_order | integer | |
| cap_reduction_enabled | boolean | capped wallets only |
| cap_reduction_rate | numeric(5,2) | 0.0–1.0, e.g. 0.50 = receives 50% of normal distribution after cap |
| created_at | timestamptz | |

### income_entries
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| amount | numeric(10,2) | |
| source | text | display name |
| source_type | text | 'manual', 'recurring', 'template' |
| date | date | |
| note | text | |
| completed_at | timestamptz | |
| income_recurring_id | uuid FK → income_recurring | |
| income_template_id | uuid FK → income_templates | |
| created_at | timestamptz | |

### income_recurring
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| name | text | |
| amount | numeric(10,2) | |
| frequency | text | 'daily','weekly','monthly','quarterly','yearly' |
| day_of_month | integer | |
| start_date | date | |
| end_date | date | null = active |
| parent_rule_id | uuid FK → self | links new to archived on amount change |
| created_at | timestamptz | |

### income_templates
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| name | text | |
| amount | numeric(10,2) | default amount (overridable at entry time) |
| note | text | |
| created_at | timestamptz | |

### income_distribution_rules
One-time setup linking a recurring income to its wallet distribution.
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| income_recurring_id | uuid FK → income_recurring | cascades on delete |
| wallet_id | uuid FK → wallets | cascades on delete |
| amount | numeric(10,2) | fixed € amount |
| priority | integer | order rules applied (lowest first) |
| created_at | timestamptz | |

Note: sum of all rules for a recurring income must always equal the income amount exactly.
For manual/template: distribution handled per-transaction via DistributionPopup, not stored.

### transactions
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| wallet_id | uuid FK → wallets | cascades on delete |
| recurring_rule_id | uuid FK → recurring_rules | fixed wallet payments only |
| amount | numeric(10,2) | always positive |
| type | text | 'debit' or 'credit' |
| date | date | |
| name | text | transaction name (variable wallets) |
| note | text | |
| remark | text | user note at confirmation (fixed wallets) |
| is_confirmed | boolean | |
| completed_at | timestamptz | |
| created_at | timestamptz | |

### recurring_rules
Fixed wallet payment rules. Never hard-deleted — end_date set instead.
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| wallet_id | uuid FK → wallets | |
| name | text | |
| description | text | |
| amount | numeric(10,2) | |
| frequency | text | 'daily','weekly','monthly','quarterly','yearly','custom' |
| day_of_month | integer | weekly=1(Mon)–7(Sun), monthly=1–31 |
| quarter_month | integer | 1/2/3 |
| yearly_month | integer | 0-indexed |
| custom_dates | jsonb | array of 'MM-DD' strings |
| custom_cycle_years | integer | |
| start_date | date | contract/agreement start |
| end_date | date | null = active |
| parent_rule_id | uuid FK → self | |
| created_at | timestamptz | |

### budget_allocations
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| wallet_id | uuid FK → wallets | |
| amount | numeric(10,2) | |
| valid_from | date | |
| valid_until | date | null = active |
| created_at | timestamptz | |

### settings (single row)
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| currency | text | 'EUR' |
| currency_symbol | text | '€' |
| month_start_day | integer | default 1 |
| theme | text | 'light' or 'dark' |
| strict_distribution | boolean | true = 100% must always be assigned for manual/template. false = remainder goes to Unallocated |
| created_at | timestamptz | |

## Supabase Database Functions
```sql
decrement_wallet_balance(p_wallet_id uuid, p_amount numeric)
increment_wallet_balance(p_wallet_id uuid, p_amount numeric)
```

## distributeIncome.js — Core Logic
Called after any income is logged. Parameters:
- distributions: array of {wallet_id, amount}
- wallets: all active wallets (for cap checking)
- isAutomated: boolean — true for recurring, false for manual/template

For each distribution entry:
1. Find the wallet
2. If capped wallet AND cap is reached (balance >= budget):
   - If isAutomated AND cap_reduction_enabled:
     reducedAmount = amount * cap_reduction_rate
     excess = amount - reducedAmount
     credit reducedAmount to wallet
     credit excess to Unallocated wallet
   - If isAutomated AND NOT cap_reduction_enabled:
     route full amount to Unallocated wallet
   - If NOT isAutomated: credit full amount regardless
3. If capped wallet AND cap NOT yet reached:
   - Credit up to cap, route excess to Unallocated
4. All other wallet types: credit full amount
5. Record each credit as a transaction (type='credit')

## Wallet Types

### Fixed (type = 'fixed')
- Driven by recurring_rules — no manual transactions
- Pending checklist auto-generated from rules
- Payments overview: this week / this month toggle
- History tab: sortable/filterable, clickable rows
- Balance debited when payments confirmed

### Variable (type = 'variable')
- Manual debit transactions only (no credit — income via Income page)
- budget_type 'accumulating': unused budget carries over
- budget_type 'capped': maximum balance = wallet.budget
  - cap_reduction_enabled + cap_reduction_rate for automated distributions
  - Reduction applies immediately when cap is reached
  - Reduction only for automated (recurring) income
  - Manual/template income always credited in full
- Overview: compact spending bar (header, top right), add transaction
  button, payment overview table (this week/this month), no month nav
- History tab: all transactions, sortable/filterable, clickable rows
- Trends tab: SVG bar chart, last 6 months spending

### Investment (type = 'investment') — Phase 7
- No monthly budget
- Asset tracking, gain/loss, portfolio charts (SVG)

### Unallocated (type = 'unallocated')
- is_system = true — cannot be deleted or edited
- Shown in wallet list under "System" group
- Receives: unallocated income remainder, capped wallet
  overflow, cap reduction excess
- Future: will support rules for redistributing excess

## Income System

### Three ways to log income:
1. **Quick entry** — one-off manual. DistributionPopup shown after.
2. **Recurring** — one-time distribution setup saved as
   income_distribution_rules. Auto-applies every time. isAutomated=true.
3. **Template** — saved name/amount. DistributionPopup shown each use.

### DistributionPopup behaviour:
- Shows all active non-system wallets grouped by type
- Each wallet: colour dot, name, current balance, amount input
- Single wallet shortcut: click name → full amount auto-filled
- Running total: green when fully assigned, orange under, red over
- Recurring setup: always strict (sum must = income amount)
- Manual/template: respects strict_distribution setting from settings table
- If not strict: remainder auto-routes to Unallocated on confirm

### Salary growth chart (IncomeRecurringDetail.jsx):
- Reads all versions via parent_rule_id chain
- Plots amount vs date range as inline SVG step chart

## Income Page Layout
Single page, no tabs:
1. Header + "Add Income" button (top right)
2. Modal with Quick Entry / Recurring / Template tabs
3. History table: sortable/filterable, clickable rows, row limit dropdown
4. Below table: Recurring cards (left) + Template cards (right)
   - Recurring cards: clickable → /income/recurring/:id
   - Template cards: clickable → confirmation modal → DistributionPopup

## Settings Page (/settings)
- Currency display (read-only)
- Month start day
- Theme toggle
- Strict distribution ON/OFF toggle
- Danger zone: "Delete all data" (red section, bottom of page)
  - Deletes: all transactions, income_entries, budget_allocations
  - Resets: all wallet balances to 0
  - Keeps: wallet definitions, recurring_rules, income_recurring,
    income_templates, income_distribution_rules, settings
  - Protected by email OTP: supabase.auth.signInWithOtp + verifyOtp

## General Design Rules
1. No manual transactions on fixed wallets — recurring rules only
2. No credit transactions on variable wallets — income via Income page
3. Recurring rules/income never hard-deleted — end_date set
4. Balance is a stored running total via increment/decrement functions
5. Confirmation modal before all financial actions
6. Clickable rows in all tables → detail modal with Close + Edit
7. date-fns for all date handling
8. No external chart libraries — SVG only
9. Tailwind only — no custom CSS files
10. lucide-react for all icons
11. isAutomated flag in distributeIncome distinguishes recurring
    (reduction rules apply) from manual/template (always full amount)

## Build & Deploy
- Local: `npm run dev` → localhost:5173
- Claude Code: `claude` in VS Code terminal
- Push to GitHub main → Vercel auto-deploys ~30s
- Env vars: .env.local (local) + Vercel dashboard (production)

## Phase Status

### Completed
- Phase 1: Foundation
- Phase 2: Core shell
- Phase 3: Income entry, wallet management, basic dashboard
- Phase 4: Fixed wallet pages + full income system
  - Recurring rules, checklist, calendar, history
  - Income page (history, recurring, templates, growth chart)
  - Income distribution system (DistributionPopup, distributeIncome,
    capped wallet reduction, Unallocated wallet)
- Phase 5: Variable wallet pages
  - Manual debit transactions, spending bar, overview table,
    history tab, trends SVG chart
- Settings page with strict distribution toggle + delete all data
- Phase 6: Dashboard rewrite (dashboardCalcs.js)
  - Projected cash position: next-30-days equation (cash now +
    expected income − upcoming costs), 6-month outlook strip
  - Needs attention: overdue payments, overspent variable wallets,
    underfunded fixed wallets — coloured alert subsections
  - This month's performance: income/spending/net/savings rate vs
    3-month average, wallet progress bars (green/orange/red by
    % of budget spent)
  - Over time: monthly/yearly toggle, income vs spending bar chart,
    cash trend line chart (both inline SVG)

### Remaining
- Phase 7: Investment wallet
  - Asset tracking (name, purchase date, price, quantity)
  - Current value input
  - Gain/loss per asset and total
  - Portfolio value over time (SVG)
  - Allocation breakdown (SVG)

- Post Phase 7: Multi-user support
  - Add user_id uuid FK to every table → auth.users
  - Update all RLS policies: auth.uid() = user_id
  - All queries filtered by user_id
  - Each user fully isolated
