# Financieel — Architecture & Project Reference

## Project Overview
A personal finance dashboard built for a single user (with multi-user support planned post-Phase 7).
Tracks income, fixed recurring costs, variable spending, and investments through a wallet-based system.

## Live URLs
- Production: https://financieel-sepia.vercel.app
- GitHub: https://github.com/bramduthoo/financieel
- Supabase project: duyttdjfvblhhjihybal.supabase.co

## Tech Stack
- **Frontend:** React 18 + Vite, deployed on Vercel
- **Styling:** Tailwind CSS (via @tailwindcss/vite plugin)
- **Routing:** React Router v6
- **Database & Auth:** Supabase (PostgreSQL)
- **Charts:** Recharts (to be added in Phase 5/6)
- **Icons:** lucide-react
- **Date handling:** date-fns

## Project Structure
```
src/
├── main.jsx                  # Entry point — mounts React into index.html
├── App.jsx                   # Root component — routing + auth protection
├── index.css                 # Global styles (imports Tailwind)
├── lib/
│   ├── supabase.js           # Supabase client (single instance, imported everywhere)
│   └── recurringUtils.js     # Payment date generation logic for all frequencies
├── pages/
│   ├── Login.jsx             # Login form — uses supabase.auth.signInWithPassword
│   ├── Dashboard.jsx         # Overview: income vs allocated vs unallocated
│   ├── Wallets.jsx           # Wallet list with create/edit/delete
│   ├── Income.jsx            # Income entry log grouped by month
│   └── WalletDetail.jsx      # Individual wallet page — layout differs by wallet type
└── components/
    ├── Layout.jsx             # Sidebar + main content wrapper
    ├── WalletCard.jsx         # Wallet card on the Wallets page — navigates to WalletDetail
    ├── WalletModal.jsx        # Create/edit wallet form modal
    ├── RecurringRules.jsx     # Manage recurring payment rules (fixed wallets)
    ├── TransactionChecklist.jsx # Pending payments checklist (fixed wallets)
    ├── UpcomingPayments.jsx   # Table/calendar view of upcoming payments
    └── PaymentHistory.jsx     # Sortable/filterable history of confirmed payments
```

## Database Schema (Supabase / PostgreSQL)
RLS is disabled on all tables — single-user app, no row-level security needed.

### wallets
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | auto-generated |
| name | text | e.g. "Rent", "Holidays" |
| type | text | 'fixed', 'variable', 'investment' |
| budget_type | text | 'fixed-recurring', 'accumulating', 'capped', 'none' |
| budget | numeric(10,2) | current monthly allocation |
| balance | numeric(10,2) | live balance — credited by income, debited by confirmed payments |
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
| source | text | e.g. "Salary", "Freelance" |
| date | date | |
| note | text | optional |
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
| note | text | payment name copied from rule |
| remark | text | user-entered note at confirmation time |
| is_confirmed | boolean | false = pending, true = paid |
| completed_at | timestamptz | timestamp when user confirmed payment |
| created_at | timestamptz | |

### recurring_rules
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| wallet_id | uuid FK → wallets | |
| name | text | short label e.g. "Rent" |
| description | text | longer context e.g. "Apartment Ghent" |
| amount | numeric(10,2) | |
| frequency | text | 'daily','weekly','monthly','quarterly','yearly','custom' |
| day_of_month | integer | day number; for weekly = 1(Mon)–7(Sun) |
| quarter_month | integer | which month in quarter: 1, 2, or 3 |
| yearly_month | integer | 0-indexed month for yearly payments |
| custom_dates | jsonb | array of 'MM-DD' strings for custom frequency |
| custom_cycle_years | integer | how many years before custom dates repeat |
| start_date | date | when the contract/agreement started (historical) |
| end_date | date | null = still active; set when rule is edited/deleted |
| parent_rule_id | uuid FK → self | links new version to archived version when amount changes |
| created_at | timestamptz | |

### budget_allocations
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| wallet_id | uuid FK → wallets | |
| amount | numeric(10,2) | budget amount that was set |
| valid_from | date | when this budget took effect |
| valid_until | date | null = still active |
| created_at | timestamptz | |

### recurring_rules (history tracking)
When a rule's amount is changed, the old rule gets end_date = today and a new rule
is inserted with parent_rule_id pointing to the old one. This preserves cost history over time.

### settings
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| currency | text | 'EUR' |
| currency_symbol | text | '€' |
| month_start_day | integer | day salary month begins (default 1) |
| theme | text | 'light' or 'dark' |

## Supabase Database Functions
Two PostgreSQL functions handle balance changes atomically:
```sql
decrement_wallet_balance(p_wallet_id uuid, p_amount numeric)
-- called when a payment is confirmed → subtracts from wallet.balance

increment_wallet_balance(p_wallet_id uuid, p_amount numeric)
-- called when income is distributed to a wallet → adds to wallet.balance
```

## Wallet Types — Behaviour Differences

### Fixed wallets (type = 'fixed')
- Driven entirely by recurring_rules — no manual transaction entry
- Auto-generates pending checklist items for every due date from start_date to today
- Confirming a payment: opens modal → user adds optional remark → saves transaction with completed_at → decrements wallet balance
- WalletDetail shows: Tab 1 (pending checklist + upcoming payments table/calendar + recurring rules manager) / Tab 2 (payment history — sortable, filterable)
- Recurring rule changes archive old rule (end_date set) and create new version (parent_rule_id set)

### Variable wallets (type = 'variable') — Phase 5
- Manual transaction entry (user logs individual purchases)
- Budget behaviour differs by budget_type:
  - 'accumulating': unused budget carries over month to month (e.g. holidays)
  - 'capped': has a maximum balance it won't exceed (e.g. clothing)
- Will show: transaction log, budget progress bar, month-over-month chart

### Investment wallets (type = 'investment') — Phase 7
- No monthly budget logic
- Tracks assets: what was bought, when, at what price, current value
- Shows gain/loss over time, portfolio charts

## Income → Wallet Distribution Logic (PENDING IMPLEMENTATION)
When an income entry is saved, the system should automatically credit each active
non-investment wallet according to distribution rules.

Distribution rules table (not yet created) will store:
- wallet_id
- distribution_type: 'fixed' (always €X) or 'percentage' (X% of income)
- amount / percentage value

On income save: read all distribution rules → call increment_wallet_balance for each wallet.
Capped wallets must check current balance + credit does not exceed budget cap before crediting.

## Auth
Single user. Supabase email/password auth. The App.jsx root component:
- Checks for active session on mount via supabase.auth.getSession()
- Listens for auth state changes via supabase.auth.onAuthStateChange()
- Redirects unauthenticated users to /login
- Redirects authenticated users away from /login to /

## Routing (React Router v6)
| Path | Component | Protected |
|---|---|---|
| /login | Login.jsx | No |
| / | Dashboard.jsx | Yes |
| /wallets | Wallets.jsx | Yes |
| /wallets/:id | WalletDetail.jsx | Yes |
| /income | Income.jsx | Yes |

## Key Design Decisions
1. **No manual transactions on fixed wallets** — all transactions come from recurring rules only
2. **Recurring rules are never truly deleted** — end_date is set instead, preserving history
3. **Balance is a running total on the wallet** — not recalculated from transactions each time
4. **Budget allocations table** tracks historical budget changes so past charts remain accurate
5. **income_entries is separate from transactions** — income is a source, not a wallet movement
6. **RLS disabled** — single user app, simplifies all queries
7. **date-fns used throughout** — never use raw JS Date arithmetic
8. **Environment variables** prefixed with VITE_ for Vite to expose them to React

## Build & Deploy
- Local dev: `npm run dev` → localhost:5173
- Push to GitHub main branch → Vercel auto-deploys within 30s
- Environment variables stored in .env.local (local) and Vercel dashboard (production)
- .env.local is git-ignored — never committed

## Completed Phases
- Phase 1: Foundation (Vite + React, GitHub, Vercel, Supabase schema, auth)
- Phase 2: Core shell (layout, routing, Supabase connection, login)
- Phase 3: Income + wallet management + basic dashboard
- Phase 4: Fixed wallet detail pages (recurring rules, checklist, calendar, history)

## Remaining Phases
- Phase 4 remainder: Salary distribution system
- Phase 5: Variable wallets (transactions, budget tracking, charts)
- Phase 6: Dashboard polish (overview charts, monthly summary)
- Phase 7: Investment wallet (asset tracking, gain/loss charts)
- Post Phase 7: Multi-user support (add user_id to all tables, filter all queries by auth user)
