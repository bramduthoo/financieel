## 2.8  From laptop to live website: Git, GitHub and Vercel

### 2.8.1  Git: version control

Code is written in small steps, and mistakes happen. **Git** is a program that records the history of a project as a chain of snapshots, so any earlier state can be inspected or restored. It runs locally on your machine, inside the project folder.

Three commands carry the daily routine. After changing some files:

```
git add .
git commit -m "Add transaction detail modal"
git push
```

`git add .` stages the changes (selects what the snapshot will contain). `git commit` takes the snapshot, with a message describing it. Each commit records who, when, what changed, and gets a unique identifier. The history of this project is the chain of all such commits, from "Initial React + Vite setup" to today, and any of them can be revisited.

`git push` is where GitHub enters.

### 2.8.2  GitHub: the shared copy

**GitHub** is a website that hosts Git projects (called **repositories**). Our repository lives at github.com/bramduthoo/financieel. It serves two purposes: it is an off-machine backup of the entire history, and it is the meeting point through which several people work on the same code. `git push` uploads your new commits to GitHub; `git pull` downloads commits others have pushed. Each collaborator works on a full local copy and synchronises through GitHub.

Parallel work is organised with **branches**. A branch is an independent line of development: you split off from the main line, build a feature in isolation over any number of commits, and when it is finished and tested, merge it back. The main line, the branch called `main`, always holds the version of the app that is live. Merging into `main` happens through a **pull request** on GitHub: a page showing every change the branch would introduce, where the other person can review and approve before the merge button is pressed. Nothing reaches `main`, and therefore nothing reaches the live site, without passing this gate.

One rule from section 2.6 bears repeating here: `node_modules` and `.env.local` are listed in a file called `.gitignore` and therefore never enter the repository. The first is bulky and reproducible; the second contains the database keys and must not be published.

### 2.8.3  Vercel: hosting and automatic deployment

**Vercel** is the hosting service: the server that hands the app to any visitor of financieel-sepia.vercel.app. It is connected to the GitHub repository and watches the `main` branch. Every time new commits arrive on `main`, Vercel automatically pulls the code, runs the production build from section 2.6.3 (`npm run build`), and puts the resulting files live. The whole pipeline is:

```
edit code → commit → push to GitHub → merge to main → Vercel builds → live
```

No manual uploading exists anywhere in the process. Vercel also stores its own copy of the environment variables (the Supabase address and key), entered once in its dashboard, since it cannot read the `.env.local` file that never left your machine.

## 2.9  The security model

The app holds financial data, so it is worth being precise about what protects it. Security here is layered: each layer assumes the one before it might fail.

**Layer 1: secrets stay out of the repository.** The Supabase address and key live in `.env.local`, which Git ignores. Browsing the GitHub repository reveals no credentials.

**Layer 2: the key in the browser is the harmless one.** Supabase issues two keys. The **anon key** is the one our frontend uses, and it is designed to be visible (anyone can find it in their browser's network traffic). It grants no data access by itself; it only identifies which Supabase project a request is for. The **service role key**, which bypasses all protection, is never used in this project and exists only in the Supabase dashboard.

**Layer 3: authentication.** Reading or writing any table requires a valid session, obtained only by logging in with the correct email and password (section 2.7.5). Requests without a session are rejected.

**Layer 4: the database enforces this itself.** The rule "only authenticated users may access these tables" is not frontend code; it is configured inside the database as **Row Level Security** (RLS). Every table carries a policy checking that the request comes from an authenticated session. This is the decisive layer: even someone who takes the anon key and crafts their own requests, bypassing our app entirely, hits the same wall, because the check happens in the database, after the request arrives, on every single row.

A current limitation is worth naming: the policies check *that* someone is logged in, not *who*. With one user account this is equivalent. The moment a second person gets an account, they would see the same data. True multi-user support (giving every row an owner and tightening the policies to "each user sees only their own rows") is the planned next step, and it strengthens exactly this layer.

## 2.10  The whole picture

To close the chapter, here is one complete action traced through every layer just described. The user opens a fixed wallet and ticks off the pending rent payment of €450.

**1. The page renders from state.** `WalletDetail.jsx` is on screen. When it appeared, a `useEffect` ran its fetch functions; `await`ed Supabase queries returned the wallet, its recurring rules and its transactions; the results landed in state via setters; React rendered the page from that state. The pending checklist visible on screen is the component `TransactionChecklist` mapping over computed pending items.

**2. A click becomes a function call.** The circle next to "Rent" carries an `onClick` callback. The click opens the confirmation modal (a state change: `setConfirmItem(item)` triggers a re-render which now includes the modal). The user confirms.

**3. The frontend writes to the backend.** The confirm handler is an `async` function. It sends an insert to Supabase, recording the payment as a confirmed transaction:

```js
await supabase.from('transactions').insert({
  wallet_id: walletId,
  recurring_rule_id: item.rule.id,
  amount: item.rule.amount,
  type: 'debit',
  date: item.dateStr,
  is_confirmed: true,
  completed_at: now,
})
```

The supabase-js client turns this into an HTTP request and attaches the session token. At Supabase, Row Level Security checks the session before the row is written.

**4. Database logic adjusts the balance.** The handler then calls the stored function, and the database subtracts €450 from the wallet's balance atomically:

```js
await supabase.rpc('decrement_wallet_balance', {
  p_wallet_id: walletId, p_amount: item.rule.amount,
})
```

**5. The screen catches up by re-fetching.** The handler ends by calling the fetch functions again and notifying the parent page (`onBalanceChanged?.()`). Fresh data arrives, setters store it, React re-renders: the item leaves the pending list, the balance pill in the header shows €450 less, and the History tab will list the payment. Nothing on the screen was edited directly; the data changed, and the screen followed.

Every concept of this chapter appears in those five steps: components and props, state and effects, async requests, the client library, RLS, and database functions. Chapter 3 now walks through the codebase file by file, and each file will be a variation on machinery you have already seen.
