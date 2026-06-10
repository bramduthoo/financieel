## 2.3  JavaScript, the working language

This section covers the parts of JavaScript you need in order to read the project's code. It assumes you know what variables, functions and loops are in general, and explains everything specific to JavaScript from scratch.

### 2.3.1  Declaring variables

A variable is created with one of two keywords:

```js
const budget = 450
let counter = 0
```

`const` declares a name that cannot be pointed at something else afterwards. `let` declares one that can be reassigned. Our code uses `const` almost everywhere: most values are computed once and then only read, and declaring them `const` makes that guarantee visible. Note that `const` protects the name, not the contents: an object or list declared with `const` can still be modified internally.

### 2.3.2  Functions

The classic way to define a function:

```js
function handleLogin() {
  // ...
}
```

JavaScript also has a compact second form called the **arrow function**, which our code uses constantly:

```js
const fmt = (n) => `€${Number(n).toFixed(2)}`
```

Read `=>` as "maps to": `fmt` takes `n` and maps it to a formatted text. When the body is one expression, its value is returned automatically, no `return` keyword needed. With braces, the arrow function behaves like a normal function body and needs an explicit `return`.

Arrow functions matter because in JavaScript, functions are values: they can be stored in variables, put inside objects, and most importantly **passed into other functions**. A function passed into another function, to be called at the right moment, is called a **callback**. The pattern is everywhere in web code: "when the user clicks, call this function", "for every element of this list, call this function". Arrow functions are the convenient way to write callbacks in place:

```js
// from Wallets.jsx — when this button is clicked, run openCreate
<button onClick={() => openCreate()}>
```

### 2.3.3  Objects

An object is a collection of named values, written with braces:

```js
const wallet = { name: 'Rent', budget: 450, type: 'fixed' }
wallet.budget          // read a field: 450
wallet.budget = 500    // change a field
```

Objects are the universal data container of JavaScript. A wallet, a transaction, a form's current contents, the response from the database: in our code, each is an object. Three shorthand notations appear often:

**Object shorthand.** When the field name and the variable name are identical, write it once. `{ name, amount }` means `{ name: name, amount: amount }`.

**Destructuring.** Unpacking fields of an object into variables in one statement:

```js
const { data, error } = await supabase.from('wallets').select('*')
```

The right-hand side returns one object with fields `data` and `error`; the statement pulls both into their own variables. Every database query in the project uses exactly this shape.

**The spread operator `...`.** Copies all fields of an object into a new object, after which individual fields can be overridden:

```js
// from RecurringRules.jsx — change one field of a form object
setForm(f => ({ ...f, [key]: val }))
```

This means: build a fresh object, copy everything from `f` into it, then set one field to a new value. The original is untouched. The bracket notation `[key]` makes the field name itself come from a variable. Why our code copies objects instead of just changing them in place is a React rule explained in section 2.4.6.

### 2.3.4  Arrays

An array is an ordered list, written with square brackets. The interesting part is how lists are processed. JavaScript work on lists is done by calling **methods on the array**, each taking a callback:

```js
wallets.map(w => w.name)            // transform every element → list of names
wallets.filter(w => w.is_active)    // keep only elements passing a test
wallets.find(w => w.id === id)      // the first element passing a test
```

The fourth essential method is `reduce`, which boils a list down to one value. It carries an accumulator from element to element:

```js
// from Dashboard.jsx — total income this month
const totalIncome = income.reduce((s, e) => s + Number(e.amount), 0)
```

`reduce` starts the accumulator `s` at `0` and, for every entry `e`, replaces `s` with `s + Number(e.amount)`. The final accumulator is the total. Reading `map`, `filter`, `find` and `reduce` fluently is the single most useful skill for reading this codebase: nearly all data handling is chains of these four.

### 2.3.5  Strings with embedded values

Text in backticks may embed expressions with `${}`:

```js
note: `Income distribution — ${sourceName}`
```

The expression inside `${}` is evaluated and spliced into the text.

### 2.3.6  Truthiness and three shortcut operators

In a condition, JavaScript treats certain values as false: `false`, `0`, `""` (empty text), `null`, `undefined` and `NaN`. Everything else counts as true. Three operators build on this and appear on nearly every page of the codebase.

**`&&` (and).** `a && b` evaluates to `b` only if `a` is truthy; otherwise it stops and evaluates to `a`. Besides its normal logical use, the interface code uses it to show something only under a condition, as section 2.4.3 will show.

**`??` (fallback).** `a ?? b` gives `b` only when `a` is `null` or `undefined`. Our queries use it to fall back to an empty list when no data came back:

```js
setWallets(data ?? [])
```

**`?.` (safe access).** `obj?.field` gives `undefined` instead of crashing when `obj` is missing. On functions, `fn?.()` calls `fn` only if it exists:

```js
onRulesChanged?.()   // notify the parent, but only if a callback was provided
```

### 2.3.7  Modules

Every file in the project is a **module**: a unit with its own private scope that explicitly shares and consumes values. Sharing is done with `export`, consuming with `import`:

```js
// lib/supabase.js — share one value with the whole app
export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// any other file — use it
import { supabase } from '../lib/supabase'
```

A module may additionally declare one **default export**, imported without braces. Every page and component in our project is a default export:

```js
export default function Dashboard() { ... }    // pages/Dashboard.jsx
import Dashboard from './pages/Dashboard'       // App.jsx
```

The import path starting with `./` or `../` is a file path relative to the importing file. An import path without those, like `import { useState } from 'react'`, refers to an installed package (section 2.6 explains where packages live).

## 2.4  React

### 2.4.1  The problem React solves

With plain JavaScript you can already build an interactive page: listen for a click, compute something, modify the DOM. For a small page that is fine. For an application like ours it collapses under its own weight, for one central reason: **keeping the screen synchronised with the data becomes unmanageable.**

Consider what happens in our app when one transaction is added. The transaction list must show a new row. The wallet balance in the header must change. The spending bar must grow. The dashboard's totals, charts and alerts must all update. With plain JavaScript, the programmer must remember every spot on the screen that depends on the changed data and write code to update each one by hand. Forget one and the screen silently shows stale numbers. As an app grows, these dependencies multiply until no one can track them.

React inverts the model. Instead of writing *how to update* the screen, you write *what the screen should look like* for any given data. When data changes, React re-evaluates that description and works out by itself which parts of the DOM must change. The programmer never touches the DOM directly. The screen becomes a pure consequence of the data, and stale displays become impossible by construction.

### 2.4.2  Components

A React application is built from **components**. A component is a JavaScript function that returns a description of a piece of interface:

```jsx
export default function Dashboard() {
  return (
    <div>
      <h1>Dashboard</h1>
      ...
    </div>
  )
}
```

Components nest. Our `App` component contains a `Layout` component, which contains the sidebar and whichever page is active; the `Wallets` page contains one `WalletCard` component per wallet. The whole interface is one big tree of components, and that tree is the architecture of the frontend. Building a screen means composing it from components; building a feature usually means writing a new component or extending one.

Components are reusable by design: `WalletCard` is written once and rendered many times, once per wallet, each time with different data. How data is fed in is the subject of props (2.4.4).

### 2.4.3  JSX

The HTML-like syntax inside those functions is called **JSX**. It is not HTML; it is a JavaScript extension that lets you write the structure of the interface directly inside code. The build tool (section 2.6) translates it into ordinary JavaScript before the browser sees it.

JSX behaves like a templating language fused into the code. Three rules carry almost everything:

**Braces embed JavaScript.** Anything inside `{}` is evaluated as a JavaScript expression and its result is rendered:

```jsx
<p>Balance: €{Number(wallet.balance).toFixed(2)}</p>
```

**Conditional rendering.** Combining braces with the `&&` operator from 2.3.6 shows an element only when a condition holds. The pattern reads "condition and element":

```jsx
// from Login.jsx — the error box exists only when there is an error
{error && (
  <div className="bg-red-50 text-red-600 ...">{error}</div>
)}
```

**Lists by mapping.** A list of data becomes a list of elements with `map`. Each element must carry a `key` attribute, a stable identifier React uses to track which item is which between updates:

```jsx
// from Wallets.jsx — one card per wallet
{list.map(w => (
  <WalletCard key={w.id} wallet={w} ... />
))}
```

Two cosmetic differences from HTML matter: the attribute for CSS classes is `className` rather than `class` (because `class` is a reserved word in JavaScript), and a component with nothing inside may be written self-closing, like `<WalletCard ... />`.

### 2.4.4  Props: passing data in

A component receives data through **props** (properties), which look like attributes at the place of use and arrive as one object in the function:

```jsx
// the parent renders:
<WalletCard wallet={w} onEdit={openEdit} onDelete={setDeleteTarget} />

// the component receives:
export default function WalletCard({ wallet, onEdit, onDelete }) { ... }
```

Props flow strictly downward, from parent to child. Notice that two of these props are functions. Passing callbacks down is how children talk back upward: `WalletCard` cannot reach into its parent, but when its edit button is clicked it calls `onEdit(wallet)`, and the parent decides what that means. Data flows down as values; events flow up as function calls. That sentence describes the traffic pattern of the entire frontend.

### 2.4.5  State: data that changes

Props are given from outside. **State** is data a component owns itself and is allowed to change: the text currently typed in a form field, whether a popup is open, the list of wallets fetched from the database. State is declared with `useState`:

```jsx
// from Login.jsx
const [email, setEmail] = useState('')
```

`useState('')` creates a piece of state with starting value `''` and hands back two things: the current value (`email`) and a function to change it (`setEmail`). The crucial rule: **state is only ever changed through the setter.** Calling `setEmail('x')` does two things: it stores the new value, and it tells React that this component's data changed, so its description of the interface must be re-evaluated. Assigning `email = 'x'` directly would change a local variable and nothing else; React would never know, and the screen would not update.

Functions like `useState` are called **hooks**, recognisable by the `use` prefix. They are React's mechanism for giving plain component functions capabilities like memory and side effects.

### 2.4.6  Re-rendering, and why state is copied rather than edited

When state changes, React calls the component function again from top to bottom, producing a fresh description of the interface, and compares it with the previous one. Only the differences are applied to the real DOM. This cycle is called a **re-render**, and it is cheap by design: computing descriptions and diffing them is fast, touching the real DOM is minimised.

This model explains a rule you will see throughout the code: state holding an object or list is never edited in place, but replaced with a modified copy:

```jsx
setForm(f => ({ ...f, [key]: val }))     // copy the form, override one field
```

React decides whether state changed by checking whether it received a *different* object. Editing the existing object in place leaves the identity unchanged, and React concludes nothing happened. Building a copy with the spread operator gives React a new object to see. That is the entire reason for the copy pattern from section 2.3.3.

### 2.4.7  Effects: doing things besides rendering

Rendering must stay pure: a component function computes a description and nothing else. But real components need to *do* things, above all fetch data from the database. Such actions are called **side effects** and have their own hook, `useEffect`:

```jsx
// from Wallets.jsx — load wallets when the page appears
useEffect(() => { fetchWallets() }, [])
```

`useEffect` takes a function to run and a **dependency list** controlling when to run it. The empty list `[]` means: run once, when the component first appears on screen. This is the standard pattern for initial data loading, and nearly every page in the project starts with it. A dependency list with values in it, like `[id]` in `WalletDetail.jsx`, means: run again whenever `id` changes, so the page reloads its data when you navigate from one wallet to another.

An effect may return a cleanup function, which React calls when the component leaves the screen. `App.jsx` uses this to unsubscribe from login-state notifications so no listener is left running:

```jsx
useEffect(() => {
  const { data: { subscription } } = supabase.auth.onAuthStateChange(...)
  return () => subscription.unsubscribe()
}, [])
```

### 2.4.8  The pattern of a typical page

Almost every page in the project is built from the same skeleton, which you will now recognise piece by piece:

```jsx
export default function Wallets() {
  const [wallets, setWallets] = useState([])          // 1. state
  const [loading, setLoading] = useState(true)

  useEffect(() => { fetchWallets() }, [])              // 2. load on appear

  async function fetchWallets() {                      // 3. fetch + store
    const { data } = await supabase.from('wallets').select('*')
    setWallets(data ?? [])
    setLoading(false)
  }

  return (                                             // 4. describe the UI
    <div>
      {loading
        ? <p>Loading...</p>
        : wallets.map(w => <WalletCard key={w.id} wallet={w} ... />)}
    </div>
  )
}
```

State at the top, an effect that triggers the first data load, fetch functions that end by storing results in state, and a JSX description that renders whatever the state currently holds. Changing state triggers a re-render, the description is re-evaluated, the screen follows. Once this loop is familiar, most files in `src/pages/` read themselves. The `async` and `await` keywords in the fetch function belong to asynchronous programming, covered with the database itself in section 2.7.
