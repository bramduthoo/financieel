# 1  Introduction

## 1.1  What Financieel does

Financieel is a personal finance web application. It tracks where money comes from, where it is supposed to go, and whether reality matches the plan.

Instead of one big bank balance, the app divides money into **wallets**. A wallet is a purpose-bound pot of money. The wallet system exists for three reasons:

1. **Organisation and strategy.** Each wallet carries its own budget and its own rules. Deciding in advance how much of every salary goes to rent, to insurances, to savings, and to free spending turns a vague intention ("I should save more") into a concrete, automated plan.
2. **Tracking against reality.** Every cost is logged in the wallet it belongs to, so the plan is continuously confronted with actual data. A wallet shows not just what was budgeted but what was really spent and what remains.
3. **The total financial picture.** Because every euro is assigned somewhere, the wallets together always add up to a complete overview: how much money there is, where it is sitting, what it is reserved for, and whether upcoming obligations are covered.

## 1.2  The core idea

Three concepts carry the entire application. Everything in the codebase exists to support one of them.

**Wallets are the unit of organisation.** Every wallet has a type that determines how it behaves:

| Type | Behaviour |
|---|---|
| Fixed | Driven by recurring payment rules; no manual entries. Rent is the classic example. |
| Variable | Manual cost entries against a monthly budget. Can be *accumulating* (unused budget carries over, e.g. Holidays) or *capped* (the balance has a maximum, e.g. Clothing). |
| Investment | Tracks assets and their value over time (planned). |
| Unallocated | A system wallet that automatically collects money not assigned anywhere else. |

**Income flows in and is distributed.** Income enters through one door (the Income page) and is split across wallets either automatically (recurring income with saved distribution rules) or interactively (a distribution popup for one-off income). Money the user does not assign lands in the Unallocated wallet.

**Balances are running totals.** Each wallet has a balance: income distribution adds to it, confirmed payments and logged costs subtract from it. The balance is stored, not recalculated. Every change goes through a pair of database functions that increment or decrement it. A balance can go negative; the app never pretends money exists that does not.

## 1.3  How this course is organised

**Chapter 2, Foundations,** explains the technologies the app is built with (JavaScript, React, Vite, Supabase, Tailwind, Vercel) and the concepts a reader coming from Python or R has not met yet: components, hooks, async requests, databases, authentication, and the security model.

**Chapter 3, The codebase script by script,** walks through every file in the project: the goal of the file, the steps its logic performs, and the code that performs them.

**The appendix, Local setup,** covers cloning the repository, installing dependencies, configuring the environment, and running the app on your own machine.
