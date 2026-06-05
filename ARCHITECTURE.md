# Financieel — Architecture & Project Reference

## Project Overview
A personal finance dashboard built for a single user (with multi-user support planned post-Phase 7).
Tracks income, fixed recurring costs, variable spending, and investments through a wallet-based system.

## Live URLs
- Production: https://financieel-sepia.vercel.app
- GitHub: https://github.com/bramduthoo/financieel
- Supabase project ID: duyttdjfvblhhjihybal

## Tech Stack
- **Frontend:** React 18 + Vite, deployed on Vercel
- **Styling:** Tailwind CSS (via @tailwindcss/vite plugin)
- **Routing:** React Router v6
- **Database & Auth:** Supabase (PostgreSQL), RLS enabled on all tables
- **Charts:** Recharts (to be added in Phase 5/6)
- **Icons:** lucide-react
- **Date handling:** date-fns

## Project Structure
```
src/
├── main.jsx                    # Entry point — mounts React into index.html
├── App.jsx                     # Root component — routing + auth protection
├── index.css                   # Global styles (imports Tailwind)
├── lib/
│   ├── supabase.js             # Supabase client (single instance, imported everywhere)
│   └── recurringUtils.js       # Payment date generation for all frequencies
├── pages/
│   ├── Login.jsx               # Login form — supabase.auth.signInWithPassword
│   ├── Dashboard.jsx           # Overview: income vs allocated vs unallocated this month
│   ├── Wallets.jsx             # Wallet list with create/edit/delete
│   ├── Income.jsx              # Income entry — manual, recurring, templates + history
│   └── WalletDetail.jsx        # Individual wallet page — layout differs by wallet type
└── components/
    ├── Layout.jsx              # Sidebar + main content wrapper
    ├── WalletCard.jsx          # Wallet card — navigates to WalletDetail on click
    ├── WalletModal.jsx         # Create/edit wallet form modal
    ├── RecurringRules.jsx      # Manage recurring payment rules (fixed wallets)
    ├── TransactionChecklist.jsx # Pending payments checklist (fixed wallets)
    ├── UpcomingPayments.jsx    # Table/calendar toggle view of upcoming payments
    └── PaymentHistory.jsx      # Sortable/filterable confirmed payment history
```

## Database Schema (Supabase / PostgreSQL)
RLS is enabled on all tables. One policy per table allows full access to authenticated users only:
`create policy "authenticated full access" on <table> for all using (auth.role() = 'authenticated')`

### wallets
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | auto-generated |
| name | text | e.g. "Rent", "Holidays" |
| type | text | 'fixed', 'variable', 'investment' |
| budget_type | text | 'fixed-recurring', 'accumulating', 'capped', 'none' |
| budget | numeric(10,2) | current monthly allocation (live value shown in UI) |
| balance | numeric(10,2) | running balance — credited by income distribution, debited by confirmed payments. Starts at 0, can go negative. No assumed starting point. |
| colour | text | hex colour for UI |
| icon | text | icon name |
| is_active | boolean | soft disable without deleting |
| sort_order | integer | controls display order |
| created_at | timestamptz | |

### income_entries
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| amount | numeric(10,2) | |
| source | text | display name e.g. "Salary", "Bonus" |
| source_type | text | 'manual', 'recurring', 'template' |
| date | date | |
| note | text | optional |
| completed_at | timestamptz | when entry was confirmed |
| income_recurring_id | uuid FK → income_recurring | null if not from recurring |
| income_template_id | uuid FK → income_templates | null if not from template |
| created_at | timestamptz | |

### income_recurring
Saved recurring income sources (e.g. salary). Amount changes are tracked over time
by archiving old versions rather than overwriting them.
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| name | text | e.g. "Salary", "Rental income" |
| amount | numeric(10,2) | |
| frequency | text | 'daily','weekly','monthly','quarterly','yearly' |
| day_of_month | integer | which day payment arrives |
| start_date | date | when this income started |
| end_date | date | null = still active; set when amount changes |
| parent_rule_id | uuid FK → self | links new version to archived version |
| created_at | timestamptz | |

### income_templates
Saved income templates with fixed amount/name but no automatic timing.
User triggers manually each time but skips re-entering details.
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| name | text | e.g. "Freelance invoice", "Birthday gift" |
| amount | numeric(10,2) | default amount (can be overridden at entry time) |
| note | text | optional default note |
| created_at | timestamptz | |

### transactions
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| wallet_id | uuid FK → wallets | cascades on delete |
| recurring_rule_id | uuid FK → recurring_rules | links to the rule that generated this |
| amount | numeric(10,2) | always positive |
| type | text | 'debit' or 'credit' |
| date | date | due date of the payment |
| note | text | payment name copied from rule at confirmation |
| remark | text | user-entered note added at confirmation time |
| is_confirmed | boolean | false = pending, true = paid |
| completed_at | timestamptz | timestamp when user confirmed payment |
| created_at | timestamptz | |

### recurring_rules
Drives all fixed wallet payment generation. Never truly deleted — end_date is set instead.
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| wallet_id | uuid FK → wallets | |
| name | text | short label e.g. "Rent" |
| description | text | longer context e.g. "Apartment Ghent city centre" |
| amount | numeric(10,2) | |
| frequency | text | 'daily','weekly','monthly','quarterly','yearly','custom' |
| day_of_month | integer | day number; weekly = 1(Mon)–7(Sun); monthly = 1–31 |
| quarter_month | integer | which month in quarter: 1, 2, or 3 |
| yearly_month | integer | 0-indexed month for yearly payments |
| custom_dates | jsonb | array of 'MM-DD' strings for custom frequency |
| custom_cycle_years | integer | how many years before custom dates repeat |
| start_date | date | when the contract/agreement started (used for historical data) |
| end_date | date | null = still active; set when rule is edited with new amount or deleted |
| parent_rule_id | uuid FK → self | links new version to archived version on amount change |
| created_at | timestamptz | |

### budget_allocations
Tracks history of budget changes per wallet so historical charts stay accurate.
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| wallet_id | uuid FK → wallets | |
| amount | numeric(10,2) | budget amount in effect during this period |
| valid_from | date | when this budget took effect |
| valid_until | date | null = still active |
| created_at | timestamptz | |

### settings
Single row — one global settings record for the app.
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| currency | text | 'EUR' |
| currency_symbol | text | '€' |
| month_start_day | integer | which day the financial month starts (default 1) |
| theme | text | 'light' or 'dark' |

## Supabase Database Functions
Two PostgreSQL functions handle wallet balance changes atomically:
```sql
decrement_wallet_balance(p_wallet_id uuid, p_amount numeric)
-- subtracts p_amount from wallets.balance
-- called when user confirms a pending payment in TransactionChecklist

increment_wallet_balance(p_wallet_id uuid, p_amount numeric)
-- adds p_amount to wallets.balance
-- will be called by income distribution system when income is logged
```

## Wallet Types — Behaviour Differences

### Fixed wallets (type = 'fixed')
- Driven entirely by recurring_rules — no manual transaction entry by user
- recurringUtils.js generates all due dates from start_date to today for each rule
- Pending checklist = every due date that has no confirmed transaction yet
- Confirming a payment: modal opens → user adds optional remark → transaction saved
  with is_confirmed=true and completed_at=now() → decrement_wallet_balance called
- Recurring rule amount changes: old rule gets end_date=today, new rule inserted
  with parent_rule_id pointing to old one — full cost history preserved
- Sub-items within a wallet: e.g. "Insurances" wallet has multiple recurring rules,
  one per insurance type. Each has its own frequency, amount, due date. The wallet
  aggregates them all.
- WalletDetail tabs:
  - Tab 1 (Overview): pending checklist → upcoming payments (table/calendar toggle) → recurring rules manager
  - Tab 2 (History): sortable + filterable confirmed payment table with due date,
    completed date, remark, amount columns. Row limit dropdown: 10/25/50/all

### Variable wallets (type = 'variable') — Phase 5
- Manual transaction entry (user logs individual purchases/deposits)
- Budget behaviour by budget_type:
  - 'accumulating': unused budget carries over month to month (e.g. holidays savings)
  - 'capped': has a maximum balance — income distribution stops crediting when cap is reached
- WalletDetail will show:
  - Running balance display
  - Add transaction form (debit or credit, amount, date, note)
  - Transaction log for current month with edit/delete
  - Budget progress bar (spent vs remaining this month)
  - Month-over-month chart (balance or spending over last 6 months)
  - History tab: all past transactions, sortable/filterable, row limit dropdown

### Investment wallets (type = 'investment') — Phase 7
- No monthly budget logic (budget_type = 'none')
- Tracks assets: name, purchase date, purchase price, quantity, current value
- Shows gain/loss per asset and total portfolio
- Charts: portfolio value over time, allocation breakdown

## Income System (Phase 4 remainder)
Three ways to log income:

1. **Quick entry** — one-off income (bonus, gift, freelance payment). User fills in
   amount, name, date, optional note. source_type = 'manual'.

2. **Recurring income** — saved income that repeats automatically (e.g. monthly salary).
   Stored in income_recurring. When triggered, creates an income_entries record with
   source_type = 'recurring' and income_recurring_id set.
   Amount change tracking: old record gets end_date set, new record created with
   parent_rule_id → enables salary growth chart over time.

3. **Template** — saved income with fixed name/amount but no automatic timing.
   User still manually triggers it each time but skips re-entering details.
   Stored in income_templates. Creates income_entries with source_type = 'template'.

Confirmation modal required before: submitting any income, saving a recurring/template,
modifying an existing recurring/template.

Income history tab: sortable (date, amount, name) + filterable (by source type or name).
Row limit dropdown: 10/25/50/all. Default 10.

Salary growth chart: reads all versions of an income_recurring record (including archived
ones via parent_rule_id chain) and plots amount over time.

## Income → Wallet Distribution (Phase 4 remainder)
When income is logged, the system automatically credits active non-investment wallets.

Requires a distribution_rules table (not yet created):
```sql
distribution_rules (
  id uuid PK,
  wallet_id uuid FK → wallets,
  distribution_type text,  -- 'fixed' or 'percentage'
  amount numeric(10,2),    -- used when type = 'fixed'
  percentage numeric(5,2), -- used when type = 'percentage'
  priority integer         -- order in which rules are applied
)
```

Logic on income save:
1. Read all active distribution rules ordered by priority
2. For each rule: calculate credit amount
3. For capped wallets: check balance + credit does not exceed wallet.budget cap
4. Call increment_wallet_balance for each wallet
5. Any income not distributed stays as unallocated (shown on dashboard)

## Auth
Single user. Supabase email/password auth.
App.jsx root component:
- Checks session on mount via supabase.auth.getSession()
- Listens for changes via supabase.auth.onAuthStateChange()
- Unauthenticated → redirect to /login
- Authenticated on /login → redirect to /

## Routing (React Router v6)
| Path | Component | Protected |
|---|---|---|
| /login | Login.jsx | No |
| / | Dashboard.jsx | Yes |
| /wallets | Wallets.jsx | Yes |
| /wallets/:id | WalletDetail.jsx | Yes |
| /income | Income.jsx | Yes |

## recurringUtils.js — Key Functions
- `generatePaymentDates(rule, upToDate)` — all due dates from rule.start_date to upToDate
- `generateUpcomingDates(rule, fromDate, count)` — next N due dates after fromDate
- `formatFrequency(frequency)` — returns human-readable label
- Handles: daily, weekly, monthly, quarterly, yearly, custom frequencies
- Custom frequency: dates stored as 'MM-DD' strings in custom_dates jsonb array,
  repeating every custom_cycle_years years
- Quarterly: uses quarter_month (1/2/3) + day_of_month, extrapolates Q2/Q3/Q4 automatically
- Weekly: day_of_month stores 1=Mon through 7=Sun

## Key Design Decisions
1. **No manual transactions on fixed wallets** — all transactions come from recurring rules only
2. **Recurring rules never truly deleted** — end_date set instead, preserving full history
3. **Balance is a stored running total** — not recalculated from transactions each time.
   Starts at 0, can go negative, no assumed starting point.
4. **budget_allocations tracks budget history** — so past charts remain accurate when budgets change
5. **income_entries is separate from transactions** — income is a source, not a wallet movement
6. **RLS enabled on all tables** — policy: authenticated users have full access, anon has none
7. **date-fns used throughout** — never use raw JS Date arithmetic
8. **Environment variables prefixed VITE_** — required for Vite to expose them to React
9. **Confirmation modal before all destructive or financial actions** — prevents misclicks
10. **Recurring rule/income amount changes create new versions** — old version archived with
    end_date, new version has parent_rule_id → enables historical amount tracking and charts

## Build & Deploy
- Local dev: `npm run dev` → localhost:5173
- VS Code terminal: `claude` to open Claude Code (already authenticated)
- Push to GitHub main → Vercel auto-deploys in ~30s
- Environment variables: .env.local (local, git-ignored) + Vercel dashboard (production)

## Phase Status
### Completed
- Phase 1: Foundation — Vite + React, GitHub, Vercel, Supabase schema, auth
- Phase 2: Core shell — layout, routing, Supabase connection, login page
- Phase 3: Income entry page, wallet management, basic dashboard summary
- Phase 4: Fixed wallet detail pages — recurring rules, pending checklist,
  upcoming payments (table + calendar), payment history, balance logic

### In Progress
- Phase 4 remainder:
  - Income page rebuild (recurring income, templates, history, salary growth chart)
  - Income → wallet distribution system

### Remaining
- Phase 5: Variable wallets
  - Manual transaction entry (debit/credit)
  - Accumulating vs capped balance behaviour
  - Budget progress bar
  - Month-over-month spending/balance chart
  - Transaction history tab

- Phase 6: Dashboard polish
  - Pie/donut chart: income breakdown by wallet
  - Wallet health indicators (on track / overspent / surplus)
  - Monthly summary: total in, total out, total saved vs last month
  - Budget alerts for overspent wallets and overdue fixed payments
  - Time range selector to view any past month

- Phase 7: Investment wallet
  - Asset tracking (name, purchase date, price, quantity, current value)
  - Gain/loss per asset and total portfolio
  - Portfolio value over time chart
  - Allocation breakdown chart
  - Optional: live price integration

- Post Phase 7: Multi-user support
  - Add user_id uuid FK to every table referencing auth.users
  - Update all RLS policies to filter by auth.uid() = user_id
  - Update all Supabase queries to include user_id
  - Each user has completely isolated data
