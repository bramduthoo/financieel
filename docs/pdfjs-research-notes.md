# pdf.js research notes — client-side PDF bank-statement import

**Status:** research only, nothing installed, no code written. Hand this to the build session.
**Researched:** 2026-07-26. Stack checked against `package.json`: React 19.2, Vite 8.0.16,
Vitest 4.1, Tailwind v4, `@vitejs/plugin-react` 6.

---

## 1. Package & version

**Install:**

```powershell
npm install pdfjs-dist@6.1.200
```

- `pdfjs-dist` is the right (and only sensible) package. It's Mozilla's official distribution of
  pdf.js. Do **not** pull in `react-pdf` / `@react-pdf-viewer` — those are viewer/render wrappers;
  we only need the text layer, and they'd add their own worker-config problems on top.
- **Latest is `6.1.200`** (confirmed against the npm registry `latest` dist-tag and the jsDelivr
  package index — both agree). Version line history: `5.5.207 → 5.6.205 → 5.7.284 → 6.0.227 →
  6.1.200`. Note: general web search results still surface 5.7.284 as "latest" — that's stale
  search-index data, the registry is authoritative.
- **React 19:** irrelevant to pdfjs-dist. It has no React dependency, no peer deps, no
  `dependencies` at all (one `optionalDependencies` entry, `@napi-rs/canvas`, which is Node-only
  and won't install/matter in a browser build). There is no React-version compatibility surface.
- **Vite 8:** no declared constraint either way. The compatibility question is entirely about
  worker/asset resolution (§2), not about the package version.
- **`engines: node >=22.13.0 || >=24`.** Your machine is on Node v24.15.0 / npm 11.12.1 — fine.
  Vercel's build image needs to be on Node 22.13+/24 too or `npm install` will warn (npm warns
  rather than fails by default, but don't let it drift).
- **Pin it.** `npm install pdfjs-dist@6.1.200` writes `^6.1.200`. Consider pinning exactly
  (`"pdfjs-dist": "6.1.200"`), because the main lib and the worker must be the *exact* same
  version and a surprise minor bump is a class of bug that only shows up at runtime. (With the
  `?url` pattern in §2 both come from the same `node_modules` tree, so they can't drift — but an
  exact pin also protects against a minor release changing the build filenames.)

**Package shape (matters for §2):** `main: build/pdf.mjs`, `types: types/src/pdf.d.ts`, **no
`exports` field, no `type` field**. No `exports` map is the useful part — every deep import path
(`pdfjs-dist/build/pdf.worker.min.mjs`) is legal and resolvable. The `.mjs` extension carries the
ESM-ness, so the missing `type: "module"` is harmless.

---

## 2. Worker setup under Vite 8 — the concrete pattern

This is the part that breaks. Background: since pdfjs-dist v4 the worker is shipped as a plain
`.mjs` file that no bundler auto-wires; you must set `GlobalWorkerOptions.workerSrc` yourself.

### The pattern to use

Put this in **one module** in our own `src/` tree (e.g. `src/lib/pdf.js`) and import
`getDocument` from there everywhere. Do not scatter worker config across components.

```js
// src/lib/pdf.js
import * as pdfjsLib from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl

export { pdfjsLib }
```

Why this shape:

- `?url` is Vite's "give me the emitted URL of this file, don't bundle it into my graph" suffix.
  In `vite build` the 1.25 MB worker is copied to `dist/assets/pdf.worker.min-<hash>.mjs` and
  `workerUrl` becomes that hashed path. In `vite dev` it resolves to the file served off
  `/node_modules/…`. Either way the worker is **not** in the main JS bundle.
- `.min.mjs` not `.mjs` — the non-minified worker is 2.2 MB vs 1.25 MB and buys nothing.
- Use the **full filename with extension**. Extensionless `pdfjs-dist/build/pdf.worker?url` is
  what a lot of older blog posts show; it's from the v3 era when a `.js` worker existed, and it's
  the exact spelling behind the "Could not read from file: …/pdf.worker.js?url" reports. There is
  no `pdf.worker.js` in 6.x.
- **Do not use** `new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url)`. Vite only
  special-cases `new URL()` with *static relative* paths; a bare package specifier is left alone
  and resolves to a nonexistent URL at runtime. It appears to work in dev on some setups and
  breaks in the production build — the worst failure mode. (Widely repeated in older answers;
  skip it.)
- **Do not** hardcode a CDN `workerSrc`. It silently version-skews against the installed lib and
  makes the import feature depend on a third party being up.

### Fallback if `?url` misbehaves under Rolldown

Vite 8 ships **Rolldown** as the default bundler for everyone (replacing esbuild + Rollup) — this
is the single biggest "Vite 8 is different" fact, and asset-query handling is exactly the kind of
thing that gets re-implemented. `?url` is a first-class documented Vite feature and is expected to
work, but if the emitted worker URL comes out wrong, the fallback is:

```js
import PdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?worker'
pdfjsLib.GlobalWorkerOptions.workerPort = new PdfWorker()
```

`?worker` puts the 2 MB file *through* the bundler rather than just copying it — slower builds,
and it has its own history of inlining the worker as base64 in some configs. Treat it as plan B,
and verify `dist/` after a `npm run build` either way.

**Last resort (avoid):** copy the worker into `public/` and point `workerSrc` at `/pdf.worker.min.mjs`.
Works, but the copy silently goes stale on every `pdfjs-dist` upgrade. If it's ever used, add a
`postinstall` copy step rather than committing the binary.

### Verification checklist for the build session

1. `npm run build` → confirm a `pdf.worker.min-<hash>.mjs` exists in `dist/assets/`.
2. `npm run preview` → import a PDF → DevTools Network shows that file fetched once, and
   DevTools ▸ Sources ▸ Threads shows a worker thread. If parsing happens on the main thread the
   UI will visibly jank on a multi-page statement — that's the tell that `workerSrc` didn't take.
3. Check the console for `Warning: Setting up fake worker` — that message means `workerSrc`
   resolution failed and pdf.js fell back to in-main-thread parsing.

### If dev-mode acts up

`vite.config.js` currently has `optimizeDeps: { include: ['recharts', 'react-is'] }` — note
`recharts` isn't in `package.json` at all (leftover; charts are inline SVG per CLAUDE.md). If the
dep optimizer trips over pdfjs-dist's 850 KB ESM entry in dev, add:

```js
optimizeDeps: { exclude: ['pdfjs-dist'] }
```

Only add it if there's an actual symptom — don't add it pre-emptively.

---

## 3. File → ArrayBuffer → positioned text → lines

### 3.1 Getting the document

```js
const buf = await file.arrayBuffer()          // File from <input type="file">
const doc = await pdfjsLib.getDocument({
  data: new Uint8Array(buf),
  useWasm: false,        // see §5 — we never decode images, so skip the wasm assets
  isEvalSupported: false // tighter CSP posture; only affects some font/JS features
}).promise
```

- **The buffer is transferred to the worker and detached.** pdf.js documents this: typed arrays
  passed as `data` generally become inaccessible on the main thread. If the buffer needs to be
  reused (retry, re-parse, upload), `slice()` a copy *before* calling `getDocument`.
- Cleanup: `await doc.destroy()` — or `loadingTask.destroy()` if you keep the task handle. Note
  `PDFDocumentProxy.prototype.destroy` semantics changed in v6 and `getDocument()` **no longer
  accepts a bare string/no-arg call** — always pass the params object. (v6 breaking change.)

### 3.2 Text items

`page.getTextContent()` returns `{ items, styles }`. Each `TextItem`:

| field | meaning |
|---|---|
| `str` | the text fragment |
| `dir` | `'ltr'` / `'rtl'` / `'ttb'` |
| `transform` | `[a, b, c, d, e, f]` — **`e` = x, `f` = y** in text space (y grows *upward*) |
| `width`, `height` | advance width / glyph height in device space |
| `fontName` | pdf.js-internal font id, key into `styles` |
| `hasEOL` | producer hinted a line break follows |

Options: `disableNormalization` (default `false` — leave it, it normalises ligatures and
whitespace, which is what we want for regex-matching statement rows) and `includeMarkedContent`
(leave `false`).

### 3.3 Reconstructing lines

The items arrive as fragments in content-stream order, not reading order. The reliable algorithm
is **bucket by y, sort by x, join with a gap heuristic**:

```js
// Reference sketch — src/lib/pdfText.js, pure + unit-testable
const Y_TOLERANCE = 2      // pt; same visual line if y differs by less than this
const SPACE_GAP   = 1      // pt; horizontal gap that implies a word break

export function itemsToLines(items) {
  const rows = []   // [{ y, items: [{ x, endX, str }] }]

  for (const it of items) {
    if (!it.str) continue                       // pdf.js emits empty spacer items
    const x = it.transform[4]
    const y = it.transform[5]

    let row = rows.find(r => Math.abs(r.y - y) <= Y_TOLERANCE)
    if (!row) { row = { y, items: [] }; rows.push(row) }
    row.items.push({ x, endX: x + it.width, str: it.str })
  }

  return rows
    .sort((a, b) => b.y - a.y)                  // top of page first (y grows upward)
    .map(row => {
      const parts = row.items.sort((a, b) => a.x - b.x)
      let text = ''
      let prevEnd = null
      for (const p of parts) {
        if (prevEnd !== null && p.x - prevEnd > SPACE_GAP) text += ' '
        text += p.str
        prevEnd = p.endX
      }
      return { y: row.y, text: text.trim(), cells: parts }
    })
    .filter(l => l.text)
}

export async function extractLines(doc) {
  const pages = []
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n)
    const { items } = await page.getTextContent()
    pages.push(itemsToLines(items))
    page.cleanup()
  }
  return pages   // per-page arrays of lines
}
```

Notes on the sketch:

- `Y_TOLERANCE` of ~2pt handles sub/superscript drift and slightly-off baselines. Too large and
  a two-column layout collapses into one line; too small and a single row splits. It's the one
  number worth tuning against real statements — make it a parameter, not a magic constant.
- `SPACE_GAP` as a flat 1pt is a starting point. A better heuristic scales with font size:
  `gap > 0.25 * it.height`. Many producers emit explicit space glyphs already, in which case the
  gap logic only has to catch column boundaries.
- **Keep `cells` (the per-fragment x positions) on each line.** Do not throw the coordinates away
  after joining. Bank statements are column layouts — the amount is right-aligned in its own
  column — and column-aware parsing (`x > 400` ⇒ amount column) is dramatically more robust than
  regexing `"24-07-2026 Kinepolis... -31,40 EUR"` as a flat string. Reconstructed lines are the
  human-readable/debug view; the cells are what a resilient parser should lean on. Preserving them
  now costs nothing and saves a rewrite later.
- `hasEOL` exists but is producer-dependent — use it as a hint, never as the primary line
  delimiter. y-bucketing is what actually works.
- **Rotated pages:** if `page.rotate !== 0`, item transforms are in unrotated text space. Map them
  through the viewport first:
  `pdfjsLib.Util.transform(page.getViewport({ scale: 1 }).transform, it.transform)`. Cheap
  insurance; add it if any real statement comes out scrambled.
- **Scanned statements have no text layer.** Total extracted text near zero ⇒ image-only PDF.
  Detect it and show a clear "this PDF has no selectable text (scanned) — import not possible"
  message rather than silently producing zero transactions. There is no OCR here and adding one
  is a different project.
- **Password-protected statements** are a real thing for bank PDFs. `getDocument(...).promise`
  rejects with `name === 'PasswordException'`; you can also supply an `onPassword` callback on the
  loading task. Worth handling in the first pass — it's a one-line catch and a much better error
  than "failed to parse".

### 3.4 Testing

The line reconstruction is pure — `itemsToLines(items)` in, lines out. That fits the repo's
`src/lib/*.test.js` convention exactly: capture a real `getTextContent()` `items` array once
(dump it to JSON from the browser), commit it as a fixture, and unit-test the reconstruction and
the row parser in Vitest without ever touching pdf.js. Keep anything that needs a real PDF out of
`src/lib/`.

---

## 4. Bundle size & code-splitting

Raw (unzipped) sizes from the published 6.1.200 tarball:

| file | bytes | in main bundle? |
|---|---:|---|
| `build/pdf.min.mjs` (the lib we import) | 452,296 | yes, unless split |
| `build/pdf.mjs` (unminified) | 849,976 | — |
| `build/pdf.worker.min.mjs` | 1,255,067 | **no** — separate asset via `?url` |
| `legacy/build/pdf.min.mjs` | 509,635 | only if targeting old browsers |
| `wasm/*.wasm` (openjpeg, jbig2, qcms, quickjs) | ~915 KB total | no — only fetched on demand |

The worker is the big one and it's already off the critical path: it's fetched lazily, only when
the first PDF is parsed. The real cost to the app's initial load is **the ~450 KB (raw) main
library** — call it roughly 130–150 KB gzipped, an estimate; measure it, don't quote it.

**Lazy-loading the import route is worth it.** Concretely:

- `src/App.jsx` currently imports **all nine pages eagerly** (lines 8–16) — zero code-splitting
  today. So pdfjs-dist would land straight in the entry chunk and be paid for by every visitor
  on every page, to support one occasional flow.
- 450 KB is roughly the size of everything else in the app put together. This isn't a marginal
  optimisation.
- The fix is contained: `React.lazy(() => import('./pages/ImportStatement'))` + a `<Suspense>`
  boundary around the routes. Vite/Rolldown then emits pdfjs-dist as its own chunk automatically —
  no `manualChunks` config needed.
- Push it one level further if you want the best result: keep the *route* eager-ish but
  `await import('../lib/pdf.js')` **inside the file-drop handler**, so the 450 KB is fetched only
  when a user actually picks a file, not when they open the page. Also makes the loading state
  honest ("preparing…" while both lib and worker download).

Don't reach for `build.rolldownOptions.manualChunks` unless the automatic split is measurably
wrong. (And note the rename — Vite 8 renamed `build.rollupOptions` → `build.rolldownOptions`.)

---

## 5. Vite 8 / React 19 / v6 gotchas

**Vite 8 specifically**

1. **Rolldown is the default bundler now.** No opt-in, no escape hatch worth using. Every
   pdf.js-in-Vite recipe you'll find online predates it and was written against esbuild+Rollup.
   Assume the `?url` pattern works (it's core Vite behaviour) but *verify the built output*
   rather than trusting a green dev server. This is the main reason to build+preview early rather
   than at the end.
2. `build.rollupOptions` → `build.rolldownOptions`. Not currently used in `vite.config.js`, so
   only relevant if chunking config gets added.
3. `?url` on a file inside `node_modules` is supported, but the third-party-module variant of it
   is a known long-standing Vite limitation (vitejs/vite#10837): a `?url` import written *inside a
   dependency's* source doesn't resolve. That's exactly why the worker wiring belongs in **our**
   `src/lib/pdf.js` — writing it in our own code sidesteps the whole issue.

**React 19 specifically**

4. **StrictMode double-invokes effects in dev.** If PDF parsing is kicked off from a `useEffect`,
   it runs twice, and the second run may hit an already-detached ArrayBuffer or a destroyed
   document — a confusing dev-only failure. Parse from the **file-input `onChange` / drop
   handler**, not from an effect. If an effect is unavoidable, guard with an `AbortController`
   and destroy the loading task in the cleanup.
5. The worker/`GlobalWorkerOptions` assignment is module-level global state, executed once on
   module import. That's correct and StrictMode-safe — just don't move it into a component.
6. No React-19-specific pdf.js incompatibility exists; pdfjs-dist doesn't touch React.

**pdf.js v6 specifically**

7. **`useWasm` defaults to `true`** (since v5, when the OpenJPEG decoder moved into a separate
   `.wasm`). If it's left on without a `wasmUrl`, pdf.js can attempt fetches that fail — there's
   an open upstream issue about exactly that. Since we only extract text and never decode JPEG2000
   / JBIG2 images, **`useWasm: false` should be the right call and avoids shipping ~900 KB of wasm
   assets entirely.** Flagging this as reasoned-but-unverified: I inferred it from what the wasm
   modules are for, I haven't run it. If any statement fails to parse, the first thing to try is
   turning it back on with `wasmUrl` pointing at a copied `pdfjs-dist/wasm/` directory.
8. **`cMapUrl` / `standardFontDataUrl`**: not needed for our case. `standardFontDataUrl` only
   affects rendering. `cMapUrl` matters for PDFs using predefined CJK CMaps — not a realistic
   scenario for Belgian/Dutch bank statements. If some exotic statement returns garbled text,
   copy `node_modules/pdfjs-dist/cmaps/` into `public/cmaps/` and pass `cMapUrl: '/cmaps/'`.
9. v6 dropped polyfills for older browsers and raised the minimum browser baseline. Fine for this
   app; only relevant if the `legacy/` build ever becomes necessary.
10. v6 API changes worth knowing: `getDocument()` requires a params object, and
    `PDFDocumentProxy.prototype.destroy` was removed in favour of the loading-task lifecycle.
    Any pre-v6 snippet you copy may use the old forms.

**Not pdf.js, but adjacent**

11. Everything here is client-side, so statement data never leaves the browser — good, and worth
    keeping that way. Whatever gets extracted still lands in Supabase via the normal path, which
    means the usual project rules apply: `user_id` on every row, and **no client-side balance
    math** — imported transactions must go through the reviewed RPCs, never a direct balance
    write. Worth settling that design question before writing the importer, not after.

---

## Sources

- [pdfjs-dist on npm](https://www.npmjs.com/package/pdfjs-dist) (registry `latest` + package.json)
- [jsDelivr package index for pdfjs-dist@6.1.200](https://data.jsdelivr.com/v1/packages/npm/pdfjs-dist@6.1.200) (file list + exact byte sizes)
- [pdf.js API docs — getDocument / getTextContent / TextItem](https://mozilla.github.io/pdf.js/api/draft/module-pdfjsLib.html)
- [mozilla/pdf.js discussion #19520 — worker import fails in Vite](https://github.com/mozilla/pdf.js/discussions/19520)
- [mozilla/pdf.js issue #19519](https://github.com/mozilla/pdf.js/issues/19519)
- [mozilla/pdf.js discussion #19666 — when/where does wasmUrl need to be set](https://github.com/mozilla/pdf.js/discussions/19666)
- [mozilla/pdf.js issue #19668 — invalid requests if wasmUrl not provided but useWasm is](https://github.com/mozilla/pdf.js/issues/19668)
- [vitejs/vite issue #10837 — ?url / ?worker / new URL inside 3rd-party module](https://github.com/vitejs/vite/issues/10837)
- [vitejs/vite discussion #17958 — pdf.js worker inlined as base64](https://github.com/vitejs/vite/discussions/17958)
- [wojtekmaj/react-pdf issue #1148 — "Could not read from file: pdf.worker.js?url"](https://github.com/wojtekmaj/react-pdf/issues/1148)
- [Vite 8.0 release announcement](https://vite.dev/blog/announcing-vite8)
- [Vite migration guide (v7 → v8)](https://vite.dev/guide/migration)
- [mozilla/pdf.js releases](https://github.com/mozilla/pdf.js/releases)
