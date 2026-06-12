## 2.5  Tailwind CSS

### 2.5.1  The idea: utility classes

Section 2.2.2 showed classic CSS: rules in a separate file selecting elements and setting their properties. That approach has a scaling problem similar to the one React solves for behaviour. As an app grows, the style file fills with hundreds of rules, rules begin to overlap and override each other, and changing one safely requires knowing every place it applies.

Tailwind takes a different approach. It provides thousands of tiny ready-made classes, each setting exactly one property, and you style an element by listing the classes it needs directly on the element:

```jsx
<button className="bg-gray-900 text-white px-4 py-2 rounded-lg text-sm font-medium">
  Add Income
</button>
```

Reading left to right: dark background, white text, horizontal padding, vertical padding, rounded corners, small text, medium font weight. These are called **utility classes**. There is no separate style file to maintain and no naming of rules; the element's appearance is fully visible at the element itself. When you delete a component, its styling disappears with it, with nothing left behind to go stale.

### 2.5.2  Reading the class names

Tailwind names follow a compact system. A short prefix names the property; a suffix names the value on a fixed scale.

| Class | Meaning |
|---|---|
| `p-5` | padding on all sides, step 5 of the spacing scale (1.25rem = 20px) |
| `px-4`, `py-2` | horizontal and vertical padding |
| `m-4`, `mb-4` | margin; margin-bottom only |
| `text-sm`, `text-3xl` | font size |
| `font-medium` | font weight 500 |
| `bg-white`, `bg-gray-900` | background colour (colour name plus shade 50–950) |
| `text-gray-600` | text colour |
| `border`, `border-stone-200` | a border; its colour |
| `rounded-lg`, `rounded-2xl` | corner rounding, increasing |
| `flex`, `flex-col` | flexbox container; stack children vertically |
| `items-center`, `justify-between` | flexbox alignment (cross axis; main axis) |
| `gap-3`, `space-y-4` | spacing between flex children; vertical gaps between siblings |
| `w-44`, `h-screen`, `flex-1` | fixed width; full viewport height; absorb remaining space |
| `hover:bg-stone-100` | apply a class only while the mouse is over the element |

The bracket notation `text-[11px]` or `bg-[#D85A30]` escapes the fixed scale and uses an exact value; the project's design system uses this for its precise colours.

With this table, the layout code from section 2.2.2 reads as plain language:

```jsx
<div className="flex h-screen bg-gray-50">      // row, full height, light grey page
  <aside className="w-56 bg-white flex flex-col">  // fixed-width white column
  <main className="flex-1 overflow-auto">          // the rest, scrollable
```

### 2.5.3  How Tailwind gets into the app

Our `src/index.css` contains one line, `@import "tailwindcss"`, and the build tool runs a Tailwind plugin (visible in `vite.config.js`). At build time, Tailwind scans every file in the project for class names and generates a CSS file containing only the classes actually used. Nothing needs to be written or maintained by hand; using a class in JSX is all it takes for it to exist.

## 2.6  Vite

### 2.6.1  Why a build tool exists

Two facts about our code make it impossible to hand it to a browser directly. First, JSX is not real JavaScript; something must translate it. Second, the project depends on external packages (React itself, the Supabase client, the icon library), which live outside our source files. A **build tool** solves both: it translates what browsers cannot read and bundles our files and the packages into plain files browsers can. Our build tool is **Vite**.

Before Vite can do anything, the packages must exist on disk. That is the job of **npm**, the package manager that comes with **Node.js** (a program that runs JavaScript outside a browser; Vite itself is JavaScript and runs on it). The file `package.json` at the project root lists every package the project depends on, with version ranges. Running `npm install` reads this list and downloads everything into the `node_modules` folder. This is why a freshly cloned copy of the repository does not run until `npm install` has been executed once, and why `node_modules` is never committed to Git: it is bulky and entirely reproducible from `package.json`.

### 2.6.2  Development mode

While building the app we run:

```
npm run dev
```

This starts Vite as a local development server, reachable only from your own machine at the address `http://localhost:5173`. It serves the app, translating JSX on the fly, and it watches every source file. When you save a file, Vite pushes the change into the open browser within a fraction of a second, usually without even reloading the page. This tight save-and-see loop is what makes frontend development workable.

`localhost` is a name every computer gives to itself, and `5173` is a **port**, one of many numbered doors a machine can listen on. Nothing about this server is public; a colleague cannot open your localhost.

### 2.6.3  Production builds and environment variables

For the public site, Vite instead performs a **build** (`npm run build`): it translates and bundles everything into a small set of optimised plain files in a `dist` folder. Those files are what the hosting service actually serves to visitors. We never run this command ourselves; the hosting service does, as section 2.8 describes.

One more Vite responsibility matters for understanding the code: **environment variables**. The file `.env.local` at the project root holds values that must stay out of the codebase, in our case the address of our database and the key used to talk to it. Vite makes any variable whose name starts with `VITE_` available to the code as `import.meta.env.VITE_...`:

```js
// lib/supabase.js
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
```

`.env.local` is deliberately excluded from version control, so these values never appear on GitHub. Section 2.9 explains why this is safe and what these keys can and cannot do.

## 2.7  The backend: databases and Supabase

### 2.7.1  Why the app needs a database

Everything described so far lives in the browser and is therefore temporary. State vanishes when the tab closes. For an app whose entire purpose is remembering financial history, the data must live somewhere permanent, reachable from any browser, guarded against unauthorised access. That place is a **database** running on a server: the backend.

Our backend is **Supabase**, a hosted service that bundles three things we would otherwise have to build and operate ourselves: a professional database, user authentication (accounts, passwords, login sessions), and an automatically generated web interface to the database, so the frontend can talk to it directly over the internet.

### 2.7.2  What a relational database is

Supabase's core is **PostgreSQL**, a relational database. A relational database stores data in **tables**. A table has named, typed **columns** and holds the data as **rows**. Our `wallets` table, simplified:

| id | name | type | budget | balance |
|---|---|---|---|---|
| 7f3a… | Rent | fixed | 450.00 | 450.00 |
| 91c2… | Holidays | variable | 200.00 | 350.00 |

Each row is one wallet. The `id` column holds a generated unique identifier, and every table has one. Tables refer to each other through these ids: each row of the `transactions` table carries a `wallet_id` column naming the wallet it belongs to. Such a reference is called a **foreign key**, and it is the "relational" in relational database. The full set of tables, columns and references is called the **schema**; ours has eight tables (wallets, transactions, income entries, recurring rules, income recurring, income templates, distribution rules, budget allocations, settings) and is documented table by table in ARCHITECTURE.md.

The language for talking to a relational database is **SQL**. We used it to create the schema, and a few pieces of project logic live in the database as SQL functions. Reading the codebase requires almost no SQL, but the shape of a query is worth recognising:

```sql
select * from wallets where is_active = true;
```

### 2.7.3  How the frontend talks to Supabase

The frontend cannot open the database directly; it sends HTTP requests (the same request and response mechanism from section 2.1) to Supabase's web interface, called an **API** (Application Programming Interface): an entry point for programs rather than people. Rather than constructing these requests by hand, we use the **supabase-js** client library, which wraps them in readable JavaScript. The single connection object is created once, in `lib/supabase.js`, and imported everywhere:

```js
import { createClient } from '@supabase/supabase-js'
export const supabase = createClient(supabaseUrl, supabaseAnonKey)
```

Queries then read almost like sentences:

```js
const { data, error } = await supabase
  .from('transactions')
  .select('*')
  .eq('wallet_id', walletId)
  .order('date', { ascending: false })
```

This fetches all columns of the transactions whose `wallet_id` matches, newest first. Writing follows the same style with `.insert({...})`, `.update({...})` and `.delete()`, each combined with filters like `.eq(...)`. Every response is an object with `data` (the result, or `null`) and `error` (the problem, or `null`), which is why the destructuring pattern from 2.3.3 opens nearly every query in the project.

### 2.7.4  Asynchronous code: `async` and `await`

A database query crosses the internet and takes time, perhaps fifty milliseconds, perhaps two seconds. JavaScript does not stop the world while waiting; the operation starts, and the program continues. Code that starts something and finishes later is **asynchronous**.

JavaScript marks the result of such an operation with an object called a Promise, but day to day you only need the two keywords built on top of it. A function declared `async` may contain waiting points; inside it, `await` pauses *that function* until a result arrives, then hands the result over:

```js
async function fetchWallets() {
  const { data } = await supabase.from('wallets').select('*')
  setWallets(data ?? [])
}
```

Without `await`, `data` would be read before the response existed. While one function is paused at an `await`, the rest of the app keeps running: the interface stays responsive, clicks still work. This is why every fetch function in the project is `async`, and why loading states exist: between starting a query and its `await` completing, the page shows "Loading...".

When several independent queries are needed at once, the project starts them together and waits for all of them, rather than awaiting one after another:

```js
// from Dashboard.jsx — two queries, in parallel
const [{ data: w }, { data: i }] = await Promise.all([
  supabase.from('wallets').select('*'),
  supabase.from('income_entries').select('*'),
])
```

### 2.7.5  Authentication

The app must know who is using it before showing anything. Supabase provides this: it stores user accounts and verifies passwords, and the client library exposes the login operations. The login page calls:

```js
const { error } = await supabase.auth.signInWithPassword({ email, password })
```

On success, Supabase issues a **session**: a signed token stored by the browser and attached automatically to every subsequent database request, proving on each request who is asking. The frontend reacts to login state through two calls in `App.jsx`: `supabase.auth.getSession()` reads the current session when the app starts, and `supabase.auth.onAuthStateChange(...)` notifies the app the moment the user logs in or out. `App.jsx` keeps the session in state and uses it as a switch: no session renders the login page, a session renders the application. Logging out (`supabase.auth.signOut()`) clears the session, the listener fires, the state empties, and the same switch sends the user back to the login screen.

### 2.7.6  Logic inside the database

One last backend concept appears in the code. Wallet balances must change atomically: read and write as one indivisible step, so two simultaneous changes cannot overwrite each other. For this, two small functions live inside the database itself, written in SQL: `increment_wallet_balance` and `decrement_wallet_balance`. The frontend invokes them by name through a **remote procedure call**:

```js
await supabase.rpc('decrement_wallet_balance', {
  p_wallet_id: walletId,
  p_amount: item.rule.amount,
})
```

Whenever you see `supabase.rpc(...)` in the code, a function stored in the database is doing the work, not JavaScript.
