### 4.1.2  The frame

Before any page or feature can load, five files must do their work: one mounts React onto the HTML document, one loads the stylesheet, one manages authentication state and routing, one provides the persistent sidebar shell, and one presents the login form. These files are explained together because they wire the application as a whole; every page described in the sections that follow sits inside the structure these five establish.

---

#### 4.1.2.1  main.jsx

`main.jsx` is the entry point of the application. It is the first JavaScript file Vite executes, and its only job is to mount the React component tree onto the single HTML element the browser provides. Section 2.2.1 noted that `index.html` contains an almost-empty body with one element: `<div id="root"></div>`. `main.jsx` is the file that fills it.

**Mounting the application.**
`createRoot` from the `react-dom/client` package takes a real DOM element and hands back a React root: an object that knows how to render and update a React component tree inside that element. Calling `.render(...)` on it places the entire application inside the `root` div, and from that point onward React controls that portion of the page. The import of `./index.css` on line 3 ensures the stylesheet is loaded as part of the same bundle.

```js
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
```

**StrictMode.**
The `App` component is wrapped in `StrictMode`, a built-in React wrapper that has no visible effect in production but activates extra checks during development. Its most noticeable behaviour is running every component function and every `useEffect` setup twice, to surface side effects that are not properly cleaned up. The double-run only happens in development; the production build behaves normally.

---

**Imports:** `App` from `./App.jsx`, `./index.css`

**Exports:** none (entry point, not imported by anything)

**Used by:** nothing (invoked by Vite as the bundle entry point)

---

#### 4.1.2.2  index.css

`index.css` is the global stylesheet for the application. The entire file is one line:

```css
@import "tailwindcss";
```

The `@import "tailwindcss"` directive, processed by the Tailwind Vite plugin, instructs Tailwind to generate its utility classes for every class name it finds in the project's source files. Section 2.5.3 explains the mechanism: at build time, Tailwind scans the JSX files and emits only the CSS for the classes actually used. Nothing needs to be written by hand. This file is the only CSS in the project.

---

**Imports:** none

**Exports:** none (stylesheet, not a module)

**Used by:** main.jsx (imported once to include the stylesheet in the bundle)

---

#### 4.1.2.3  App.jsx

`App.jsx` is the root component of the application. It does two things: it tracks whether a user session exists, and it uses that knowledge to decide what the router should render. Every page and component in the project is a descendant of `App`, which means this component runs before anything else and its session state is the gate through which all content passes.

The component imports the `supabase` client from `lib/supabase.js`, the `Layout` shell, and every page component. It uses two React Router components, `BrowserRouter` and `Routes`, that it wraps around the whole tree.

**The session state and its three values.**
Session state is initialised to `undefined`, not `null`. This distinction is intentional. During the brief moment at startup before the `getSession` call resolves, the component does not yet know whether a session exists. `undefined` represents this third state: "not yet determined". `null` would mean "definitely no session", which would cause the app to flash to the login page and then immediately redirect back to the dashboard as the real session arrived. `undefined` allows the app to show a loading screen instead, which is what section 2.7.5 describes as the correct startup pattern.

```js
const [session, setSession] = useState(undefined)
```

**Watching for login and logout.**
The `useEffect` (section 2.4.7) fires once when `App` first mounts and does two things. The first is a one-time `getSession()` call that reads any existing session from the browser's stored token and sets the state immediately. The second is a subscription to `onAuthStateChange`, which fires every time the user logs in or out, keeping the state synchronised with reality for the lifetime of the app. The cleanup function returned by the effect cancels that subscription when the component is removed, preventing stale listeners.

```js
useEffect(() => {
  supabase.auth.getSession().then(({ data: { session } }) => {
    setSession(session)
  })
  const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
    setSession(session)
  })
  return () => subscription.unsubscribe()
}, [])
```

**The loading guard.**
While `session` is `undefined`, the component renders a full-screen loading message rather than any part of the application. This prevents the router from making a routing decision before it knows whether a session exists, which would produce an incorrect flash. Once `getSession` resolves, `session` becomes either a session object or `null`, and the guard condition is no longer met.

```js
if (session === undefined) {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <p className="text-gray-400">Loading...</p>
    </div>
  )
}
```

**The routing structure.**
After the guard, the component returns a `BrowserRouter` containing a `Routes`. Two top-level routes are declared. The `/login` route renders the `Login` component when no session exists, and redirects to `/` with `Navigate` when one does: a logged-in user who navigates to `/login` is sent to the dashboard automatically. The `/*` route covers everything else. If a session exists, it renders the `Layout` shell wrapping a nested `Routes` with one route per protected page. If no session exists, it redirects to `/login`. The `replace` prop on both `Navigate` calls means the redirect replaces the current entry in the browser's history rather than adding to it, so pressing the back button does not loop between the redirect and the destination.

```js
<Route path="/*" element={
  session
    ? <Layout>
        <Routes>
          <Route path="/"                    element={<Dashboard />}             />
          <Route path="/wallets"             element={<Wallets />}               />
          ...
          <Route path="/income/recurring/:id" element={<IncomeRecurringDetail />} />
          <Route path="/settings"            element={<Settings />}              />
        </Routes>
      </Layout>
    : <Navigate to="/login" replace />
} />
```

The nested `Routes` inside `Layout` is a React Router v6 pattern for nested routing: the outer `Routes` matches the `/*` wildcard, and the inner `Routes` then matches the specific path among the protected pages. The `Layout` component receives the matched page as its `children` prop and renders it inside the main content area, as section 4.1.2.4 explains.

---

**Imports:** `supabase` from `./lib/supabase`, `Layout`, `Dashboard`, `Wallets`, `WalletDetail`, `Income`, `IncomeRecurringDetail`, `Settings`, `Login`

**Exports:** `App` (default)

**Used by:** main.jsx

---

#### 4.1.2.4  Layout.jsx

`Layout.jsx` is the persistent shell that surrounds every protected page. It renders the sidebar, including the application title, navigation links, and sign-out button, alongside a scrollable main content area. Every page component in `pages/` is rendered inside this shell; the shell itself never changes as the user navigates between pages. Only the content area re-renders.

The component imports `NavLink` and `useNavigate` from React Router, and the `supabase` client for the sign-out operation.

**The navigation items.**
The four navigation destinations are declared as a module-level constant, an array of objects each carrying a `path` and a `label`. Keeping this array outside the component function means it is created once, not on every render. Adding a new page to the navigation is a matter of adding one object to this array.

```js
const navItems = [
  { path: '/',         label: 'Dashboard' },
  { path: '/wallets',  label: 'Wallets'   },
  { path: '/income',   label: 'Income'    },
  { path: '/settings', label: 'Settings'  },
]
```

**Sign-out.**
`handleSignOut` calls `supabase.auth.signOut()`, which clears the stored session token. When it resolves, `navigate('/login')` sends the browser to the login page. The `onAuthStateChange` listener registered in `App.jsx` will also fire at this moment, setting `session` to `null` and causing the router to redirect to `/login` independently. The explicit `navigate` call and the listener-driven redirect are both present for robustness; in practice the effect is the same.

```js
async function handleSignOut() {
  await supabase.auth.signOut()
  navigate('/login')
}
```

**The flex layout.**
The outer container is a full-height flex row (section 2.5.2): the sidebar is a fixed-width column on the left, and the main content area stretches to fill the remaining horizontal space. The Tailwind classes `flex h-screen` on the outer div establish the row at full viewport height; `w-56` fixes the sidebar at 224 pixels; `flex-1` on the main element absorbs all remaining width. `overflow-auto` on the main element means the page content can scroll while the sidebar stays fixed.

```js
<div className="flex h-screen bg-gray-50">
  <aside className="w-56 bg-white border-r border-gray-200 flex flex-col">
    ...
  </aside>
  <main className="flex-1 overflow-auto">
    <div className="p-8">{children}</div>
  </main>
</div>
```

**NavLink and active styling.**
React Router's `NavLink` component is like a plain `Link` but it passes an `isActive` boolean into its `className` prop, indicating whether its destination is the current page. The `Layout` component uses this to toggle between two Tailwind class strings: an indigo-tinted style for the active link and a neutral grey style for inactive ones. The callback form of `className`, `({ isActive }) => ...`, is the standard React Router v6 pattern for this.

```js
<NavLink
  to={item.path}
  end={item.path === '/'}
  className={({ isActive }) =>
    `block px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
      isActive ? 'bg-indigo-50 text-indigo-600' : 'text-gray-600 hover:bg-gray-100'
    }`
  }
>
```

The `end` prop on the Dashboard link deserves attention. Without it, a `NavLink` with `to="/"` would be considered active on every URL, because every path begins with `/`. The `end` prop tells React Router to match the path only when the URL is exactly `/` rather than anything that starts with it. The expression `end={item.path === '/'}` evaluates to `true` for the Dashboard entry and `false` for all others, so only the Dashboard link gets this exact-match behaviour.

**The children prop.**
`Layout` accepts a `children` prop (section 2.4.4). In the JSX returned by `App.jsx`, the nested `Routes` tree sits between the opening and closing `<Layout>` tags, which makes it `children`. The `{children}` expression inside `Layout`'s `main` element is where the currently matched page component appears. When the user navigates from Dashboard to Wallets, only that expression's content changes; the sidebar remains.

---

**Imports:** `supabase` from `../lib/supabase`

**Exports:** `Layout` (default)

**Used by:** App.jsx

---

#### 4.1.2.5  Login.jsx

`Login.jsx` renders the login form. It is the only page that is accessible without a session. On a successful login, no navigation code runs in `Login.jsx` itself: once `signInWithPassword` resolves, Supabase issues a session, the `onAuthStateChange` listener in `App.jsx` fires, the session state changes, and the router sends the user to the dashboard automatically. The login page only has to call the API; the redirect is a consequence of the session state machinery in `App.jsx`.

Section 2.7.5 describes the authentication sequence in detail. Section 2.10 traces the full login event through every layer of the application.

**State.**
Four pieces of state cover the form completely. `email` and `password` hold the current field values. `error` holds an error message to display or `null` when there is no error. `loading` tracks whether a request is in flight. The pattern of four `useState` declarations at the top of a component, each representing one piece of independently changing data, is the standard React form approach from section 2.4.5.

```js
const [email,    setEmail]    = useState('')
const [password, setPassword] = useState('')
const [error,    setError]    = useState(null)
const [loading,  setLoading]  = useState(false)
```

**The login handler.**
`handleLogin` is an `async` function (section 2.7.4) that runs when the user clicks the button or presses Enter. It sets `loading` to `true` and clears any previous error before calling `supabase.auth.signInWithPassword`. If the call returns an error, the message is stored in the `error` state and displayed in the form. `loading` is set back to `false` in either outcome so the button returns to its normal state.

```js
async function handleLogin() {
  setLoading(true)
  setError(null)
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) {
    setError(error.message)
  }
  setLoading(false)
}
```

**Controlled inputs.**
Both form fields are controlled inputs: the React state variable drives the `value` attribute, and an `onChange` handler updates the state on every keystroke (section 2.4.5). The `onKeyDown` handler uses the `&&` shortcut from section 2.3.6 to call `handleLogin` only when the pressed key is Enter, giving the form keyboard accessibility without additional complexity.

```js
<input
  type="email"
  value={email}
  onChange={e => setEmail(e.target.value)}
  onKeyDown={e => e.key === 'Enter' && handleLogin()}
  placeholder="you@example.com"
  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm
             focus:outline-none focus:ring-2 focus:ring-indigo-500"
/>
```

**Conditional error display.**
The error box is rendered only when `error` is not `null`, using the `&&` conditional rendering pattern from section 2.4.3. Supabase's error messages are short enough to display directly; no translation layer is needed.

```js
{error && (
  <div className="bg-red-50 text-red-600 text-sm px-4 py-3 rounded-lg mb-4">
    {error}
  </div>
)}
```

**The submit button.**
The button's `disabled` attribute is bound to the `loading` state. While a request is in flight, the button is non-interactive and rendered at half opacity via Tailwind's `disabled:opacity-50` class. The label switches between `'Sign in'` and `'Signing in...'` using a ternary expression embedded in JSX.

```js
<button
  onClick={handleLogin}
  disabled={loading}
  className="w-full bg-indigo-600 text-white py-2 rounded-lg text-sm
             font-medium hover:bg-indigo-700 disabled:opacity-50"
>
  {loading ? 'Signing in...' : 'Sign in'}
</button>
```

---

**Imports:** `supabase` from `../lib/supabase`

**Exports:** `Login` (default)

**Used by:** App.jsx
