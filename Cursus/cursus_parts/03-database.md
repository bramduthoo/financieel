# 3  The Database Schema

## 3.1  Introduction

Chapter 2.7 introduced the database as the permanent layer of the application: the place that holds all data across sessions, across devices, and across restarts. Section 2.7.2 described what a relational database is, how it organises data into tables with typed columns, and how tables reference each other through foreign keys. This chapter documents the schema itself: the precise, permanent shape of the data the application works with.

The schema comprises nine tables. Three of them deal primarily with wallets and the money flowing through them: `wallets` defines every wallet and stores its running balance; `transactions` records every individual credit and debit; and `budget_allocations` tracks a wallet's budget history across time. Four tables belong to the income system: `income_entries` logs each income event, `income_recurring` defines recurring salary or payment schedules, `income_templates` stores named amount presets, and `income_distribution_rules` encodes how each recurring income should be split across wallets on arrival. One table, `recurring_rules`, holds the payment schedule definitions that drive fixed wallets. One final table, `settings`, holds the single row of application-wide configuration.

Understanding the schema is understanding the backbone of the application. Every piece of logic in the frontend either reads from or writes to this structure, and the constraints, defaults, and relationships defined here enforce rules that JavaScript code relies on but cannot enforce on its own.

## 3.2  Conventions used in every table

Every table in the schema shares a small set of structural conventions. Learning them once means not having to re-explain them nine times.

**The primary key.** Every table has a column named `id` of type `uuid`. A UUID is a 128-bit random identifier, written as a hexadecimal string in groups (for example, `7f3a1c8e-4d2b-4e1a-9a3c-1f2e3d4c5b6a`). The column carries the constraint `primary key`, which means every row's id is unique across the table and no row may have a null id. The default is `gen_random_uuid()`, a built-in PostgreSQL function that generates a new UUID at the moment a row is inserted. The frontend therefore never needs to supply an id when creating a record; the database generates one automatically.

The reason for using UUIDs rather than sequential integers (1, 2, 3, ...) is safety: a sequential id leaks how many records exist and makes it easy to guess neighbouring ids. A random UUID reveals nothing about the rows around it.

**The creation timestamp.** Every table has a column `created_at` of type `timestamptz`, meaning a timestamp with time-zone information included. Its default is `now()`, so it is filled automatically when a row is inserted. The application uses it for sorting history tables and for understanding when records were created.

**The absence of updated_at.** Almost no table in this schema carries an `updated_at` column. The reason is that very few records are ever edited in place. Wallets are occasionally renamed. Settings are occasionally changed. But transactions are never edited, income entries are never edited, and recurring rules are never edited: if a rule changes, a new rule is created and the old one is archived. An `updated_at` column on tables whose rows are written once and never touched again would be noise.

**Foreign keys.** When one table references another, the referencing column is named `<table>_id`, where `<table>` is the singular name of the referenced table. The column carries a `references` clause pointing to the other table's `id`. Some foreign keys also carry `on delete cascade`, which means: if the referenced row is deleted, the rows that point to it are automatically deleted too. Which keys carry this clause and why is noted in each table's section below.

**Deletion by end date.** Two tables in the schema, `recurring_rules` and `income_recurring`, hold records that must never be truly deleted, because past transactions or income entries already reference them and their history must remain intact. Instead of deleting a rule when it is retired, the application sets a date in its `end_date` column. A null `end_date` means the rule is currently active. A non-null `end_date` means the rule was retired as of that date. Any query for active rules filters on `end_date is null`.

## 3.3  Table: wallets

### 3.3.1  What the table represents

Each row of the `wallets` table represents one named pot of money with its own purpose, budget, and running balance. Wallets are the central organising concept of the application. Section 1.1 explains the four wallet types (fixed, variable, investment, and unallocated) and why dividing money into purpose-bound pots serves a budgeting goal; this section documents the columns that make those concepts concrete in the database.

### 3.3.2  Schema

```sql
create table wallets (
  id                    uuid          primary key default gen_random_uuid(),
  name                  text          not null,
  type                  text          not null,
  budget_type           text          not null,
  budget                numeric(10,2) not null default 0,
  balance               numeric(10,2) not null default 0,
  colour                text,
  icon                  text,
  is_active             boolean       not null default true,
  is_system             boolean       not null default false,
  sort_order            integer       not null default 0,
  cap_reduction_enabled boolean       not null default false,
  cap_reduction_rate    numeric(5,2)  not null default 0,
  created_at            timestamptz   not null default now()
);
```

### 3.3.3  Columns

**type** stores one of four values: `fixed`, `variable`, `investment`, or `unallocated`. This single column determines the entire behaviour of the wallet across the interface, from which tabs are shown in `WalletDetail.jsx` to whether the transaction form accepts manual entries. It is the dispatch column for wallet behaviour throughout the application.

**budget_type** refines the meaning of the `budget` column. Where `type` describes the wallet's role, `budget_type` describes how the budget figure is interpreted:

- `fixed-recurring`: the budget column holds the sum of all recurring payment rules. It is maintained by the application whenever rules change, not edited directly by the user.
- `accumulating`: a variable wallet whose unused monthly budget rolls over, so the balance grows over time until it is spent. A holiday fund is the canonical example.
- `capped`: a variable wallet whose balance is not allowed to exceed the budget amount. Any income distribution that would push the balance above the cap is redirected elsewhere. A clothing budget is a typical example.
- `none`: a wallet with no monthly budget, intended for investment wallets.
- `unallocated`: reserved for the single system wallet that collects any income not assigned elsewhere.

**budget** holds the monetary value associated with the budget type. For a capped wallet it is the ceiling the balance may not exceed; for an accumulating wallet it is the monthly addition target; for a fixed-recurring wallet it is the sum of the payment rules. The type `numeric(10,2)` means a decimal number with up to ten digits in total and exactly two digits after the decimal point, which matches standard currency precision.

**balance** is the stored running total: every credit increments it and every debit decrements it. This is a design choice worth understanding. An alternative would be to compute the balance on demand by summing all transactions for the wallet. The stored approach is faster (one read rather than summing potentially thousands of rows) but requires discipline: the balance is only ever changed through the two dedicated database functions described in section 3.12. Direct updates to this column are never made from the frontend.

**colour** and **icon** are display-only strings used by the interface to style each wallet card. `colour` holds a hex code such as `#D85A30`; `icon` holds the name of a `lucide-react` icon. Neither has any significance for financial logic.

**is_active** allows a wallet to be retired without deletion. An inactive wallet no longer appears in the distribution popup or the main wallet list, but its historical transactions remain intact and queryable.

**is_system** is set to true on exactly one row: the Unallocated wallet. The interface uses this flag to prevent the user from deleting or editing that wallet, since it plays a structural role in the income distribution system. Any income that is not explicitly assigned to another wallet during distribution lands here automatically.

**sort_order** is an integer that lets the user control the sequence in which wallets are presented. The application writes it when the user reorders their wallet list.

**cap_reduction_enabled** and **cap_reduction_rate** apply only to capped wallets that have reached their ceiling. When `cap_reduction_enabled` is true and the wallet's balance is already at or above the budget, automated income distributions do not drop to zero: they continue at a reduced rate. `cap_reduction_rate` is a fraction between 0 and 1 stored as `numeric(5,2)`; a value of `0.50` means the wallet continues receiving 50% of its normal allocation while at capacity, with the remaining 50% redirected to the Unallocated wallet. The full logic lives in `distributeIncome.js`. For manual and template income, this reduction is never applied regardless of the cap state, because the user is making an explicit allocation decision in real time.

### 3.3.4  Foreign key relationships

No other table is referenced by `wallets`. Several tables reference it: `transactions`, `recurring_rules`, `income_distribution_rules`, and `budget_allocations` each carry a `wallet_id` foreign key pointing here. `wallets` is the hub of the dependency graph (see section 3.14).

### 3.3.5  Design notes

The combination of `type` and `budget_type` might initially appear redundant, but each answers a different question. `type` answers "what kind of wallet is this?" and drives structural decisions: which page components appear, which operations are permitted. `budget_type` answers "how does the budget number behave?" and drives calculation decisions: how the monthly budget is projected, what happens at cap. A fixed wallet is always `fixed-recurring`; variable wallets may be `accumulating` or `capped`. These two orthogonal concepts need two columns.

## 3.4  Table: transactions

### 3.4.1  What the table represents

Each row of the `transactions` table records one financial event affecting a wallet: either a credit (money entering the wallet) or a debit (money leaving it). Every wallet balance change is the result of a transaction row. The table is therefore the complete ledger of the application.

### 3.4.2  Schema

```sql
create table transactions (
  id                uuid          primary key default gen_random_uuid(),
  wallet_id         uuid          not null references wallets(id) on delete cascade,
  recurring_rule_id uuid          references recurring_rules(id),
  amount            numeric(10,2) not null,
  type              text          not null,
  date              date          not null,
  name              text,
  note              text,
  remark            text,
  is_confirmed      boolean       not null default false,
  completed_at      timestamptz,
  created_at        timestamptz   not null default now()
);
```

### 3.4.3  Columns

**wallet_id** references the wallet this transaction belongs to. The `on delete cascade` means: if a wallet is deleted, all its transactions are deleted with it. A wallet and its entire financial history live and die together.

**recurring_rule_id** links a fixed-wallet debit to the recurring rule that generated it. It is nullable: variable wallet debits (manual cost entries) have no rule, and all credit transactions (income distributions) have no rule either. For a fixed-wallet payment, this column is how the application knows which rule was fulfilled when filtering the payment history or determining which upcoming payments remain pending.

**amount** is always positive, regardless of whether the transaction is a credit or debit. The direction is stored separately in `type`.

**type** is either `debit` (money leaving the wallet) or `credit` (money entering it). Credits arise from income distribution. Debits arise from fixed-wallet payment confirmations and variable-wallet manual cost entries.

**date** is the calendar date the transaction is attributed to, as a `date` type (no time component). For income distribution transactions it is the date the income was entered. For fixed-wallet confirmations it is the payment date. For variable-wallet entries it is the date the user assigns to the transaction.

**name** is a free text label for the transaction, used mainly by variable-wallet entries to describe what was purchased. Fixed-wallet transactions derive their label from the recurring rule name rather than storing it redundantly here.

**note** and **remark** are both optional text fields that serve different purposes. `note` is set programmatically: income distribution transactions receive a standardised note such as `Income distribution — Salary`. `remark` is set by the user at the moment of confirming a fixed-wallet payment and represents a personal annotation about that specific instance.

**is_confirmed** distinguishes between a transaction that has been acknowledged by the user and one that is pending. For fixed wallets, the confirm handler sets this to true and calls `decrement_wallet_balance` at the same moment. Variable-wallet entries are inserted as confirmed immediately, since the user's act of submitting the form is itself the confirmation.

**completed_at** records the exact timestamp when confirmation happened. It differs from `date` (the attributed date, which the user chooses) and from `created_at` (when the row was inserted): `completed_at` is specifically when the user performed the act of confirming.

### 3.4.4  Foreign key relationships

`wallet_id` references `wallets(id)` with cascade on delete. `recurring_rule_id` references `recurring_rules(id)` without cascade: if a recurring rule is retired (its `end_date` is set), the past transactions that referenced it remain intact and the foreign key still points to the archived rule row. A transaction never references `income_entries` directly; the connection is implicit through the note text.

### 3.4.5  Design notes

Storing `amount` as always positive and recording direction in a separate `type` column rather than using signed amounts (positive for credit, negative for debit) makes aggregations more readable. Summing all credits for a period and summing all debits are two separate, self-documenting queries. A signed-amount design would require careful sign-handling to avoid conflating the two directions.

## 3.5  Table: recurring_rules

### 3.5.1  What the table represents

Each row of the `recurring_rules` table defines a recurring payment schedule for a fixed wallet: its name, amount, and when it falls due. The `TransactionChecklist` and `UpcomingPayments` components generate their content entirely from this table, using the date-calculation logic in `recurringUtils.js` to project future payment dates from the stored schedule. Rows in this table are never deleted; retiring a rule means setting its `end_date`.

### 3.5.2  Schema

```sql
create table recurring_rules (
  id                 uuid          primary key default gen_random_uuid(),
  wallet_id          uuid          not null references wallets(id),
  name               text          not null,
  description        text,
  amount             numeric(10,2) not null,
  frequency          text          not null,
  day_of_month       integer,
  quarter_month      integer,
  yearly_month       integer,
  custom_dates       jsonb,
  custom_cycle_years integer,
  start_date         date          not null,
  end_date           date,
  parent_rule_id     uuid          references recurring_rules(id),
  created_at         timestamptz   not null default now()
);
```

### 3.5.3  Columns

**wallet_id** references the fixed wallet this rule belongs to. A wallet may have many rules: a household-costs wallet might hold rent, utilities, and insurance as three separate recurring rules.

**frequency** takes one of six values: `daily`, `weekly`, `monthly`, `quarterly`, `yearly`, or `custom`. Each value triggers a different calculation path in `recurringUtils.js`.

**day_of_month** carries different meanings depending on frequency. For monthly rules it is the day number within the month (1 through 31). For weekly rules it encodes the day of the week as an integer where 1 is Monday and 7 is Sunday. The overloading of one column for two semantics is deliberate: separate `day_of_month` and `day_of_week` columns would each be null on all rows that did not need them, and a single nullable column reduces width without ambiguity, because the `frequency` column makes the interpretation unambiguous.

**quarter_month** is used when frequency is `quarterly`. It holds 1, 2, or 3, identifying which month within the quarter the payment falls. Combined with `day_of_month`, it pinpoints the exact day: `quarter_month = 1` and `day_of_month = 15` means the 15th of January, April, July, and October.

**yearly_month** is used when frequency is `yearly` and holds the zero-indexed month number (0 for January, 11 for December), following JavaScript's `Date` convention. `recurringUtils.js` projects forward from `start_date` using this value.

**custom_dates** is a JSONB column holding an array of date strings in `MM-DD` format (for example, `["03-01", "09-01"]`) for payments with an irregular schedule that repeats on the same calendar dates each year. JSONB is PostgreSQL's binary JSON type: it is stored in a parsed binary form rather than raw text, which allows the database to validate the JSON structure and permits queries into the array contents. For the application, `custom_dates` is read as a JavaScript array.

**custom_cycle_years** accompanies `custom_dates` and allows the cycle to span multiple years. A value of 2 means the dates fire every two years rather than annually.

**start_date** is the date the rule began. The application uses it as the lower bound when generating the payment schedule: no dates before `start_date` are projected. For a rent contract that began on 1 March 2024, `start_date` is `2024-03-01`.

**end_date** is null for active rules and set to the final date of applicability for retired ones. The application queries `end_date is null` to find currently active rules.

**parent_rule_id** is a self-referencing foreign key. When a rule is edited (for example, the rent amount increases), the application does not update the existing row. Instead, it sets `end_date` on the old row and inserts a new row with `parent_rule_id` pointing at the old one. This preserves the complete history of a rule across amount changes. The chain of `parent_rule_id` links forms a linked list from the most recent version back to the original. An equivalent chain exists on `income_recurring` (section 3.7) for the salary growth chart.

### 3.5.4  Foreign key relationships

`wallet_id` references `wallets(id)` without cascade on delete: the application guards at the application layer against deleting a wallet that still has active rules. `parent_rule_id` references `recurring_rules(id)` on the same table (a self-join). `transactions.recurring_rule_id` references this table from the other side.

### 3.5.5  Design notes

The variety of scheduling columns might seem verbose, but the payment world genuinely demands all of them. Rent is monthly on a fixed day. A quarterly insurance premium needs `quarter_month`. A yearly car tax needs `yearly_month`. A union membership with specific annual dates needs `custom_dates`. Rather than store a single opaque expression string that `recurringUtils.js` would have to parse, the schema stores each parameter of the schedule in a typed column the application can query and manipulate directly.

## 3.6  Table: income_entries

### 3.6.1  What the table represents

Each row of the `income_entries` table records one income event: an amount of money that entered the system. A row is inserted whenever income is logged, regardless of whether it came via a quick manual entry, a recurring income schedule, or a template. The income history page on the Income tab reads from this table.

### 3.6.2  Schema

```sql
create table income_entries (
  id                  uuid          primary key default gen_random_uuid(),
  amount              numeric(10,2) not null,
  source              text          not null,
  source_type         text          not null,
  date                date          not null,
  note                text,
  completed_at        timestamptz,
  income_recurring_id uuid          references income_recurring(id),
  income_template_id  uuid          references income_templates(id),
  created_at          timestamptz   not null default now()
);
```

### 3.6.3  Columns

**source** is the display name shown in the income history: the name of the recurring income (for example, "Salary"), the template name (for example, "Freelance project"), or a user-supplied description for quick entries.

**source_type** records how the entry was created: `manual` for a quick one-off entry, `recurring` for an instance of a recurring income schedule, or `template` for an instance of a named template. This column is used both for display (the income history shows a type badge per row) and for understanding the provenance of the entry.

**date** is the income date assigned by the user, as a `date` type. For recurring income it is usually today but may be adjusted. For manual entries it is whatever date the user selects.

**note** is an optional free-text field the user may fill in at entry time.

**completed_at** records the timestamp of entry creation, parallel in purpose to the same column on transactions.

**income_recurring_id** links this entry to its recurring income definition when `source_type` is `recurring`. It is null otherwise. The link allows the application to group entries by their source when displaying the history of a particular recurring income.

**income_template_id** links this entry to its template definition when `source_type` is `template`. It is null otherwise. Quick entries leave both foreign keys null; they are self-contained.

### 3.6.4  Foreign key relationships

Both `income_recurring_id` and `income_template_id` are nullable foreign keys without cascade. Deleting a recurring income definition or a template does not remove past income entries that used them; the entries are permanent history and retain their `source` text even if the originating record is gone.

### 3.6.5  Design notes

`income_entries` does not store how the income was distributed across wallets. Distribution produces credit transactions in the `transactions` table; the income entry is the cause and those transactions are the effects. Tracing the full story of one income entry means reading the entry row and then finding all credit transactions inserted on the same date with a matching source name in their `note` field. A direct foreign key from `transactions` back to `income_entries` would make this join precise; the current design traces the relationship through the note text, which is a pragmatic choice given that the distribution was originally built without that link.

## 3.7  Table: income_recurring

### 3.7.1  What the table represents

Each row of the `income_recurring` table defines a recurring income source: a salary, a pension, a regular freelance retainer. Like `recurring_rules`, records here are never hard-deleted. Retiring an income source means setting its `end_date`. Changing its amount means archiving the current row and creating a new one with `parent_rule_id` pointing backward, so the full history of salary changes is preserved.

### 3.7.2  Schema

```sql
create table income_recurring (
  id             uuid          primary key default gen_random_uuid(),
  name           text          not null,
  amount         numeric(10,2) not null,
  frequency      text          not null,
  day_of_month   integer,
  start_date     date          not null,
  end_date       date,
  parent_rule_id uuid          references income_recurring(id),
  created_at     timestamptz   not null default now()
);
```

### 3.7.3  Columns

**name** is what the user sees: "Salary", "Pension", "Freelance retainer". It is stored in any income entry created from this record as the `source` field.

**amount** is the expected income amount for each occurrence of this recurring source.

**frequency** is one of: `daily`, `weekly`, `monthly`, `quarterly`, or `yearly`. The `custom` frequency supported by `recurring_rules` is absent here, because income schedules are generally regular; the application does not yet need to project future income for custom-date patterns.

**day_of_month** carries the same semantics as in `recurring_rules`: the day within the month for monthly frequency, or the weekday number for weekly frequency.

**start_date** is when the income source began, used as the lower bound for projecting past and future occurrences.

**end_date** is null for an active income source and set when it is retired.

**parent_rule_id** is a self-reference, exactly as in `recurring_rules`. The salary growth chart in `IncomeRecurringDetail.jsx` follows this chain to plot amount changes over time as a step chart: each version of the record contributes one step on the chart, from its `start_date` to its `end_date`.

### 3.7.4  Foreign key relationships

`parent_rule_id` references `income_recurring(id)` on the same table. `income_entries.income_recurring_id` references this table, linking each instance of income logging back to its source definition. `income_distribution_rules.income_recurring_id` (section 3.9) also references this table, linking the saved wallet distribution plan to its income source.

## 3.8  Table: income_templates

### 3.8.1  What the table represents

Each row of the `income_templates` table represents a named, reusable income preset: a saved name and default amount for income sources that are not on a fixed schedule but recur occasionally under the same label. A freelance project, a tax refund, a gift: the user creates a template once and reuses it so they do not have to retype the same label each time.

### 3.8.2  Schema

```sql
create table income_templates (
  id         uuid          primary key default gen_random_uuid(),
  name       text          not null,
  amount     numeric(10,2) not null,
  note       text,
  created_at timestamptz   not null default now()
);
```

### 3.8.3  Columns

**name** is the label shown on the template card on the income page and used as the `source` field in any income entry created from the template.

**amount** is the default amount, which the user may override at entry time. A template for "Freelance project" might carry a default of €500 but be overridden to €750 for a larger engagement.

**note** is an optional stored annotation visible when using the template, providing context or a reminder.

### 3.8.4  Foreign key relationships

`income_entries.income_template_id` references this table. No other table references `income_templates`.

### 3.8.5  Design notes

Templates are the simplest table in the schema: four columns of meaningful data, no self-references, and no soft-deletion. They can be deleted outright because deleting a template does not remove the income entries that were created from it; those entries retain their `source` text and `amount` and remain in the history regardless of whether the template still exists.

## 3.9  Table: income_distribution_rules

### 3.9.1  What the table represents

Each row of the `income_distribution_rules` table encodes one line of a recurring income's wallet distribution: how much of that income should flow to a specific wallet each time it is logged. If a salary of €2,500 is to be split into €900 for Rent, €400 for Variable Expenses, €600 for Savings, and €600 for Unallocated, four rows exist for that recurring income, one per target wallet. Together those four rows constitute the complete, saved distribution plan for that income source.

### 3.9.2  Schema

```sql
create table income_distribution_rules (
  id                  uuid          primary key default gen_random_uuid(),
  income_recurring_id uuid          not null references income_recurring(id) on delete cascade,
  wallet_id           uuid          not null references wallets(id) on delete cascade,
  amount              numeric(10,2) not null,
  priority            integer       not null default 0,
  created_at          timestamptz   not null default now()
);
```

### 3.9.3  Columns

**income_recurring_id** links the rule set to a specific recurring income. All rows sharing the same `income_recurring_id` together represent the complete distribution for that income source. When the application processes a recurring income entry, it reads all rows with the matching `income_recurring_id` and passes them to `distributeIncome.js`.

**wallet_id** identifies which wallet receives the money. The distribution popup shows all active non-system wallets; each one the user assigns an amount to becomes a row here.

**amount** is a fixed euro amount, not a percentage. The constraint that the amounts across all rows for one recurring income must sum exactly to the income amount is enforced by the application at the moment of saving the distribution setup, not by a database constraint.

**priority** controls the order in which distributions are applied when income is received. Lower numbers are applied first. This matters for capped wallets: if a capped wallet receives its allocation before others and its cap is already reached, the overflow goes to Unallocated. Priority ordering ensures predictable behaviour when multiple wallets with caps interact with the same pool of money.

### 3.9.4  Foreign key relationships

Both foreign keys carry `on delete cascade`. If a recurring income is deleted, all its distribution rules are deleted with it, because the rule set has no meaning without the income it belongs to. If a wallet is deleted, all distribution rules that assigned money to it are deleted too, because the rule set would be incomplete and unexecutable.

### 3.9.5  Design notes

Distribution rules for manual entries and templates are not stored in this table. When a user performs a manual or template income entry, the distribution is decided interactively through the `DistributionPopup` component. The chosen amounts are applied immediately through `distributeIncome.js`, producing credit transactions, but no row is written to `income_distribution_rules`. Only recurring income has a saved, repeatable distribution plan. For all other income types, the distribution decision is made fresh each time.

## 3.10  Table: budget_allocations

### 3.10.1  What the table represents

Each row of the `budget_allocations` table records one historical budget assignment for a wallet: how much was allocated to it during a specific period. The table forms a timeline of budget changes, where each row is one version of the budget, valid from `valid_from` until `valid_until`. The current allocation is the row whose `valid_until` is null.

### 3.10.2  Schema

```sql
create table budget_allocations (
  id          uuid          primary key default gen_random_uuid(),
  wallet_id   uuid          not null references wallets(id),
  amount      numeric(10,2) not null,
  valid_from  date          not null,
  valid_until date,
  created_at  timestamptz   not null default now()
);
```

### 3.10.3  Columns

**wallet_id** links the allocation to a wallet.

**amount** is the budget figure for this period, using the same two-decimal precision as all other monetary columns.

**valid_from** is the first date this budget applies. When a user raises the budget of a variable wallet from €300 to €400 starting next month, a new row is inserted with `valid_from` set to the first of next month.

**valid_until** is the last date this budget applied, or null if the allocation is still current. When a new allocation is created for a wallet, `valid_until` is set on the outgoing row to the day before the new one begins, so the timeline has no gaps or overlaps.

### 3.10.4  Foreign key relationships

`wallet_id` references `wallets(id)` without cascade. No other table references `budget_allocations`.

### 3.10.5  Design notes

The current application reads the wallet's budget from the `wallets.budget` column directly for display and calculations, rather than querying `budget_allocations` on every page load. The `budget_allocations` table exists to support historical analysis: knowing what the budget was during a past period, so that overspend can be evaluated correctly in retrospect. The dashboard's performance calculations may draw on it over time. Because of this dual storage, a write to `wallets.budget` should always be accompanied by a corresponding write to `budget_allocations`.

One detail about lifecycle: the Settings page's "Delete all data" action removes rows from `budget_allocations` along with `transactions` and `income_entries`, treating historical budget records as part of the data that gets cleared rather than part of the structural configuration that persists (see ARCHITECTURE.md, Settings Page section).

## 3.11  Table: settings

### 3.11.1  What the table represents

The `settings` table holds exactly one row: the application-wide configuration for the current user. Unlike every other table, it is not a collection of entities but a single record. It is read once on startup and written only when the user changes a preference on the Settings page.

### 3.11.2  Schema

```sql
create table settings (
  id                  uuid        primary key default gen_random_uuid(),
  currency            text        not null default 'EUR',
  currency_symbol     text        not null default '€',
  month_start_day     integer     not null default 1,
  theme               text        not null default 'light',
  strict_distribution boolean     not null default true,
  created_at          timestamptz not null default now()
);
```

### 3.11.3  Columns

**currency** and **currency_symbol** store the user's currency preference. In the current single-user implementation these default to EUR and the euro sign and are read-only in the interface. They exist as columns rather than hardcoded constants so that multi-currency support would require only a settings update rather than a code change.

**month_start_day** is the day of the month considered the start of a financial month. For users paid on the 25th, setting this to 25 means that "this month's" income and spending are measured from the 25th to the 24th, aligning the reporting window with the natural rhythm of their cash flow. The dashboard calculations in `dashboardCalcs.js` read this value when computing monthly summaries and projected positions.

**theme** is either `light` or `dark` and controls the CSS class applied to the root element, which selects the active Tailwind colour scheme.

**strict_distribution** governs the distribution popup for manual and template income entries. When true, the user must assign the full income amount before confirming; leaving any amount unallocated is prevented. When false, any unallocated remainder is automatically routed to the Unallocated wallet on confirmation. Recurring income always uses strict distribution regardless of this setting, because its rules are pre-configured to sum exactly to the income amount.

### 3.11.4  Foreign key relationships

The `settings` table references no other table and is referenced by no other table.

### 3.11.5  Design notes

The single-row design is a valid and common pattern for configuration tables in small applications. Because there is only one row, the query that reads it omits any filter: `select * from settings limit 1`. When multi-user support is added, a `user_id` column will be introduced and the query will filter by `auth.uid()`, at which point each user will have their own settings row and the table will become a proper collection like the others.

## 3.12  The two balance functions

### 3.12.1  Why they exist

Section 2.7.6 introduced database functions and the reason for using them: atomicity. A wallet balance change involves reading the current balance and writing a new value. If two requests arrive at nearly the same moment, a naive approach would be:

1. Request A reads balance: €450.
2. Request B reads balance: €450.
3. Request A writes €450 + €200 = €650.
4. Request B writes €450 + €300 = €750.

The final balance is €750, but it should be €950. Both increments happened, but B's write overwrote A's, and €200 is permanently lost. This class of problem is called a race condition and it occurs whenever a read and a write are not performed as a single indivisible step.

The solution is to push the update inside the database as an `update ... set balance = balance + amount` statement. The database engine performs the read and write in one atomic operation; no other update can slip between them. That is the entire content of the two functions.

### 3.12.2  Function definitions

```sql
create or replace function increment_wallet_balance(
  p_wallet_id uuid,
  p_amount    numeric
)
returns void
language sql
as $$
  update wallets
  set    balance = balance + p_amount
  where  id = p_wallet_id;
$$;

create or replace function decrement_wallet_balance(
  p_wallet_id uuid,
  p_amount    numeric
)
returns void
language sql
as $$
  update wallets
  set    balance = balance - p_amount
  where  id = p_wallet_id;
$$;
```

Both functions take the same two parameters: `p_wallet_id` identifies the row to update, and `p_amount` is always a positive number representing the magnitude of the change. The `p_` prefix is a naming convention signalling that these are procedure parameters, not column names, to avoid confusion when they appear alongside column names in the SQL body. The functions return `void`, meaning they perform a side effect and return no data. They are written in the `sql` language variant, meaning the body is pure SQL with no procedural logic.

### 3.12.3  How they are called from JavaScript

The frontend never updates the `wallets.balance` column directly. Every balance change anywhere in the application goes through one of these two functions via `supabase.rpc`:

```js
// crediting a wallet during income distribution (from distributeIncome.js)
await supabase.rpc('increment_wallet_balance', {
  p_wallet_id: dist.wallet_id,
  p_amount: amount,
})

// debiting a wallet when a fixed payment is confirmed (from WalletDetail.jsx)
await supabase.rpc('decrement_wallet_balance', {
  p_wallet_id: walletId,
  p_amount: item.rule.amount,
})
```

`supabase.rpc` sends the function name and its parameters as an HTTP request to the Supabase API (see section 2.7.6). Supabase executes the function on the database server. Because the update happens inside the database engine, RLS policies apply (section 3.13) and the operation is atomic.

## 3.13  Row Level Security

### 3.13.1  What RLS does

Section 2.9 described the four security layers of the application. The fourth and decisive layer is Row Level Security: policies stored inside the database that are evaluated on every query, regardless of how the request arrived. Even a user who takes the anon key (the key visible in any browser's network traffic, as section 2.9 explains as intentional and safe) and constructs raw HTTP requests cannot read or write data if the RLS policies reject the request.

### 3.13.2  Current policies

RLS is enabled on all nine tables. The current policy on every table follows this pattern:

```sql
alter table wallets enable row level security;

create policy "authenticated users only"
  on wallets
  for all
  using (auth.role() = 'authenticated');
```

The same two statements apply to each of the remaining eight tables, with the table name substituted. `for all` means the policy governs every operation: select, insert, update, and delete. `auth.role()` is a Supabase function that returns the role of the caller. It returns `authenticated` when the request carries a valid session token and `anon` otherwise. The `using` clause must evaluate to true for a row to be accessible; any row where it evaluates to false is invisible and unwriteable, as though it did not exist.

### 3.13.3  What the current policy enforces

The current policy enforces that only a logged-in user may access any data at all. An unauthenticated request (no session token, or an expired one) receives an empty result set or an error on every query, even with a valid anon key. This closes the gap between the frontend auth guard (the application redirects unauthenticated visitors to the login page) and the data layer: the data cannot be extracted by bypassing the frontend code.

### 3.13.4  The current limitation and the planned tightening

The current policy checks whether someone is logged in, not who is logged in. With a single user account, these two checks are equivalent: the only person who can log in is the owner. The moment a second account exists, any authenticated user would see all rows belonging to any other user.

Multi-user support, planned after Phase 7, will add a `user_id uuid references auth.users` column to every table and replace the current policy with:

```sql
create policy "users see own rows only"
  on wallets
  for all
  using (auth.uid() = user_id);
```

`auth.uid()` returns the UUID of the currently authenticated user. This policy reduces the visible rows on every query to only those owned by the requester. The anon key exposure that section 2.9 describes as safe remains safe at that stage too, because the policy runs in the database after the request arrives, not in the frontend before it leaves.

## 3.14  How the tables connect

The nine tables form a clear dependency graph. The central node is `wallets`: seven of the other eight tables reference it directly or indirectly. The diagram below shows which table references which (an arrow means "has a foreign key pointing to"):

```
income_recurring ──(self-ref: parent_rule_id)
    │
    ├──► income_entries
    │
    └──► income_distribution_rules ──────────────────────► wallets
                                                               │
income_templates                                               │
    │                                                          │
    └──► income_entries                                        │
                                                               │
recurring_rules ──(self-ref: parent_rule_id)                   │
    │       ▲                                                   │
    │       └── transactions ──────────────────────────────────┘
    │
    └──────────────────────────────────────────────────────► wallets

budget_allocations ────────────────────────────────────────► wallets

settings   (no foreign keys in either direction)
```

Reading the graph: `transactions` references both `wallets` (via `wallet_id`) and `recurring_rules` (via `recurring_rule_id`). `recurring_rules` references `wallets` and itself via `parent_rule_id`. `income_distribution_rules` references both `income_recurring` and `wallets`. `income_entries` references both `income_recurring` and `income_templates`. `budget_allocations` references `wallets`. `settings` stands alone.

The practical consequence for the frontend is that queries frequently span tables. Fetching everything needed to display a wallet detail page requires `wallets`, `transactions`, and `recurring_rules`, typically in parallel (section 2.7.4). The income distribution operation touches `income_recurring`, `income_distribution_rules`, `wallets`, and `transactions` in sequence. The dependency graph makes the read and write patterns of the application predictable: the wallets table is at the centre of nearly every significant operation, which is why its balance must be protected by atomic functions (section 3.12) and why every table that references it defines clearly whether wallet deletion should cascade.
