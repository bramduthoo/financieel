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
- **Charts:** Inline SVG only — recharts was removed due to Vite 8 + React 19 incompatibility
- **Icons:** lucide-react
- **Date handling:** date-fns
- **NO external chart libraries** — all charts are plain SVG elements

## Project Structure
```
src/
├── main.jsx                      # Entry point
├── App.jsx                       # Root — routing + auth protection
├── index.css                     # Global styles (imports Tailwind)
├── lib/
│   ├── supabase.js               # Supabase client (single instance)
│   └── recurringUtils.js         # Payment date generation for all frequencies
├── pages/
│   ├── Login.jsx                 # Login form
│   ├── Dashboard.jsx             # Overview: income vs allocated vs unallocated
│   ├── Wallets.jsx               # Wallet list with create/edit/delete
│   ├── Income.jsx                # Income page — history + add + recurring/template cards
│   ├── IncomeRecurringDetail.jsx # Detail page for a recurring income + growth chart
│   ├── Settings.jsx              # General app settings (NEW)
│   └── WalletDetail.jsx          # Individual wallet — layout differs by type
└── components/
    ├── Layout.jsx                # Sidebar + main content wrapper
    ├── WalletCard.jsx            # Wallet card — navigates to WalletDetail
    ├── WalletModal.jsx           # Create/edit wallet form modal
    ├── RecurringRules.jsx        # Recurring payment rules (fixed wallets)
    ├── TransactionChecklist.jsx  # Pending payments checklist (fixed wallets)
    ├── UpcomingPayments.jsx      # Table/calendar of upcoming payments (fixed wallets)
    ├── PaymentHistory.jsx        # Confirmed payment history (fixed wallets)
    ├── VariableTransactionForm.jsx  # Add transaction form (variable wallets)
    ├── VariableTransactionList.jsx  # Transaction list (variable wallets)
    └── WalletTrendsChart.jsx     # SVG trends chart (variable wallets)
```

## Routing (React Router v6)
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
| budget | numeric(10,2) | monthly allocation |
| balance | numeric(10,2) | running balance — starts at 0, can go negative |
| colour | text | hex colour |
| icon | text | |
| is_active | boolean | |
| is_system | boolean | true for the Unallocated wallet — cannot be deleted |
| sort_order | integer | |
| cap_reduction_enabled | boolean | capped wallets only |
| cap_reduction_rate | numeric(5,2) | % of normal distribution received after cap (e.g. 0.50 = 50%) |
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
| income_recurring_id | uuid FK → income_recurring | null if not from recurring |
| income_template_id | uuid FK → income_templates | null if not from template |
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
| end_date | date | null = still active |
| parent_rule_id | uuid FK → self | links new version to archived on amount change |
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
Links a recurring income to its wallet distribution setup.
Created once when setting up the recurring income. Editable later.
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| income_recurring_id | uuid FK → income_recurring | |
| wallet_id | uuid FK → wallets | |
| amount | numeric(10,2) | fixed € amount to send to this wallet |
| priority | integer | order rules are applied (lowest first) |
| created_at | timestamptz | |

Note: distribution is always fixed € amounts (not percentages).
The sum of all rules for a recurring income must equal the income amount exactly.
For manual/template income: distribution is handled per-transaction via a popup,
not stored as permanent rules. Unallocated remainder goes to the Unallocated wallet.

### transactions
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| wallet_id | uuid FK → wallets | cascades on delete |
| recurring_rule_id | uuid FK → recurring_rules | for fixed wallet payments |
| amount | numeric(10,2) | always positive |
| type | text | 'debit' or 'credit' |
| date | date | due date / transaction date |
| note | text | |
| name | text | transaction name (variable wallets) |
| remark | text | user note added at confirmation (fixed wallets) |
| is_confirmed | boolean | false = pending, true = done |
| completed_at | timestamptz | |
| created_at | timestamptz | |

### recurring_rules
Fixed wallet payment rules. Never hard-deleted — end_date set instead.
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| wallet_id | uuid FK → wallets | |
| name | text | short label |
| description | text | longer context |
| amount | numeric(10,2) | |
| frequency | text | 'daily','weekly','monthly','quarterly','yearly','custom' |
| day_of_month | integer | day number; weekly=1(Mon)–7(Sun) |
| quarter_month | integer | 1/2/3 — which month in quarter |
| yearly_month | integer | 0-indexed month |
| custom_dates | jsonb | array of 'MM-DD' strings |
| custom_cycle_years | integer | repeat cycle for custom |
| start_date | date | contract start (historical) |
| end_date | date | null = active; set on edit/delete |
| parent_rule_id | uuid FK → self | links new to archived on amount change |
| created_at | timestamptz | |

### budget_allocations
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| wallet_id | uuid FK → wallets | |
| amount | numeric(10,2) | |
| valid_from | date | |
| valid_until | date | null = still active |
| created_at | timestamptz | |

### settings
Single row — global app settings.
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| currency | text | 'EUR' |
| currency_symbol | text | '€' |
| month_start_day | integer | default 1 |
| theme | text | 'light' or 'dark' |
| strict_distribution | boolean | default true — if true, 100% of income must be assigned for ALL income types. If false, unassigned income goes to the Unallocated wallet |
| created_at | timestamptz | |

## Supabase Database Functions
```sql
decrement_wallet_balance(p_wallet_id uuid, p_amount numeric)
-- subtracts from wallet.balance — called when payment confirmed or debit transaction saved

increment_wallet_balance(p_wallet_id uuid, p_amount numeric)
-- adds to wallet.balance — called when income is distributed to a wallet
```

## Wallet Types

### Fixed (type = 'fixed')
- Driven by recurring_rules — no manual transaction entry
- Pending checklist auto-generated from rules
- Payments overview: upcoming payments filtered by 'this week' or 'this month' toggle
- History tab: sortable/filterable confirmed payments, clickable rows for detail/edit
- Balance: debited when payments confirmed

### Variable (type = 'variable')
- Manual transaction entry (debit only — all income goes via Income page)
- budget_type 'accumulating': unused budget carries over month to month
- budget_type 'capped': has a maximum balance
  - cap_reduction_enabled: if true, automated distributions are reduced once cap is reached
  - cap_reduction_rate: e.g. 0.50 means wallet receives 50% of its normal distribution
  - Reduction applies immediately when cap is reached
  - Reduced amount routes to the Unallocated wallet
  - Rate reduction only applies to automated (recurring) income distribution
  - Manual and template income distributions are never auto-reduced
- Overview tab: spending bar (compact, top right of header), add transaction button,
  payment overview table (this week/this month toggle), no month navigation
- History tab: all transactions sortable/filterable, clickable for detail/edit
- Trends tab: SVG bar chart, last 6 months spending

### Investment (type = 'investment') — Phase 7
- No monthly budget
- Asset tracking, gain/loss, portfolio charts

### Unallocated (type = 'unallocated')
- Created by default for every user — is_system = true, cannot be deleted
- Shown in wallet list in its own group ("System")
- Receives: unallocated income remainder (when strict_distribution = false),
  and reduced amounts from capped wallets
- Future: will have rules to decide what to do with excess money
- Balance tracked same as other wallets via increment_wallet_balance

## Income System

### Three ways to log income:
1. **Quick entry** — one-off, manual. Distribution popup shown after submission.
2. **Recurring** — saved with permanent distribution rules (income_distribution_rules).
   Distribution popup appears once during setup, then auto-applies every time income fires.
   Amount changes: archive old record (end_date), create new with parent_rule_id.
3. **Template** — saved name/amount, no automatic timing. Distribution popup shown
   each time template is used.

### Distribution popup (manual + template):
- Shows all active non-system wallets
- User assigns € amounts to wallets
- Single wallet shortcut: click one wallet → full amount assigned automatically
- If strict_distribution = true: sum must equal income amount before saving
- If strict_distribution = false: remainder goes to Unallocated wallet automatically

### Distribution popup (recurring — setup only):
- Same UI as above
- Sum must ALWAYS equal income amount exactly (strict for recurring regardless of setting)
- Saved as income_distribution_rules records
- Editable later from the recurring income detail page

### Salary growth chart:
- Lives on IncomeRecurringDetail.jsx
- Reads all versions of the recurring income (current + archived via parent_rule_id chain)
- Plots amount vs valid date range as inline SVG bar/step chart

## Income Page Layout
Single page, no tabs:
1. Header: "Income" title + "Add Income" button (top right)
2. "Add Income" opens modal with three options: Quick Entry (default), Recurring, Template
3. History table: all income_entries, sortable/filterable, clickable rows
4. Below table: two side-by-side sections
   - Left: Recurring income cards (clickable → /income/recurring/:id)
   - Right: Template cards (clickable → confirmation modal to log instantly)

## Settings Page (/settings)
Sidebar navigation item. Contains:
- Currency (currently EUR, symbol €)
- Month start day
- Theme (light/dark)
- Strict distribution toggle (ON = 100% must always be assigned for manual/template;
  OFF = remainder goes to Unallocated wallet)

## General Design Rules
1. No manual transactions on fixed wallets — recurring rules only
2. No credit transactions on variable wallets — income via Income page only
3. Recurring rules/income never hard-deleted — end_date set, history preserved
4. Balance is a stored running total — not recalculated from transactions
5. All balance changes go through increment/decrement Supabase functions
6. Confirmation modal required before all financial actions
7. Clickable rows in all history/overview tables → detail modal with Close + Edit
8. date-fns for all date handling — never raw JS Date arithmetic
9. No external chart libraries — SVG only
10. Tailwind only for styling — no custom CSS files
11. lucide-react for all icons

## Build & Deploy
- Local: `npm run dev` → localhost:5173
- Claude Code: type `claude` in VS Code terminal (already authenticated)
- Push to GitHub main → Vercel auto-deploys in ~30s
- Env vars: .env.local (local, git-ignored) + Vercel dashboard (production)

## Phase Status

### Completed
- Phase 1: Foundation
- Phase 2: Core shell
- Phase 3: Income entry, wallet management, basic dashboard
- Phase 4: Fixed wallet pages (recurring rules, checklist, calendar, history)
- Phase 4 Income: Income page rebuild (history table, recurring, templates, growth chart)
- Phase 5: Variable wallet pages (transactions, spending bar, overview table, history, trends)

### In Progress — Income Distribution System
Three tasks remaining before Phase 6:

**Task 1 — Foundation (not yet built):**
- Add is_system + cap_reduction fields to wallets table
- Add strict_distribution to settings table
- Create income_distribution_rules table
- Create the default Unallocated wallet (seeded, is_system=true)
- Build Settings page (/settings) with sidebar nav item

**Task 2 — Distribution logic (not yet built):**
- Distribution popup for recurring income setup (one-time, sum must = amount)
- Distribution popup for manual/template income (per transaction, strict or flexible)
- Logic: when income logged, credit each wallet per rules, route remainder to Unallocated

**Task 3 — Capped wallet reduction (not yet built):**
- Settings panel on capped wallets: enable reduction, set rate %
- When income distributed to capped wallet that is at cap:
  apply reduction rate, route reduced portion to Unallocated wallet

### Remaining Phases
- Phase 6: Dashboard polish
  - Income breakdown chart (SVG pie/donut)
  - Wallet health indicators
  - Monthly summary (total in/out/saved vs last month)
  - Budget alerts
  - Time range selector for past months

- Phase 7: Investment wallet
  - Asset tracking
  - Gain/loss charts (SVG)
  - Portfolio breakdown

- Post Phase 7: Multi-user support
  - Add user_id to all tables
  - Update RLS policies to filter by auth.uid()
  - Each user has fully isolated data

## Key SQL to run before Task 1
```sql
-- Wallets additions
alter table wallets add column if not exists is_system boolean default false;
alter table wallets add column if not exists cap_reduction_enabled boolean default false;
alter table wallets add column if not exists cap_reduction_rate numeric(5,2) default 1.0;

-- Settings addition
alter table settings add column if not exists strict_distribution boolean default true;

-- Distribution rules table
create table if not exists income_distribution_rules (
  id uuid primary key default gen_random_uuid(),
  income_recurring_id uuid not null references income_recurring(id) on delete cascade,
  wallet_id uuid not null references wallets(id) on delete cascade,
  amount numeric(10,2) not null,
  priority integer not null default 0,
  created_at timestamptz default now()
);

-- RLS on new table
alter table income_distribution_rules enable row level security;
create policy "authenticated full access" on income_distribution_rules
  for all using (auth.role() = 'authenticated');

-- Seed the default Unallocated wallet (run once)
insert into wallets (name, type, budget_type, budget, balance, colour, is_system, sort_order)
values ('Unallocated', 'unallocated', 'unallocated', 0, 0, '#94a3b8', true, 9999)
on conflict do nothing;
```
