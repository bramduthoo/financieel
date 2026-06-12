## 4.2  The project root

Everything covered in section 4.1 lives inside the `src/` folder. The files sitting directly in the project root configure the machinery around that code: how the app is built, which packages it depends on, how the linter checks it, what the browser receives as its first document, and which files Git should never see. These files are rarely edited after initial setup, but reading them completes the picture of how the project works as a whole.

---

### 4.2.1  package.json

`package.json` is the central manifest of a Node.js project. It serves three purposes at once: it declares the project's identity and metadata, it lists every package the project depends on, and it defines the shorthand commands used during development and deployment. Section 2.6.1 explains that `npm install` reads this file and downloads the listed packages into `node_modules`.

**Project metadata.**
Three top-level fields describe the project itself. `"name": "financieel"` is the project identifier. `"private": true` prevents the project from being accidentally published to the public npm package registry. `"type": "module"` tells Node.js that the project's JavaScript files use ES module syntax (`import`/`export`) rather than the older CommonJS syntax (`require`). This matters primarily for config files like `vite.config.js` and `eslint.config.js`, which run in Node.js rather than in a browser.

**The scripts block.**
The four entries in `"scripts"` are the commands run with `npm run <name>`. Section 2.6.2 covers `dev` and section 2.6.3 covers `build`. `preview` serves the production build locally for testing before deploying. `lint` runs ESLint across the whole project.

```json
"scripts": {
  "dev":     "vite",
  "build":   "vite build",
  "lint":    "eslint .",
  "preview": "vite preview"
},
```

**Runtime dependencies.**
The `"dependencies"` block lists packages that are bundled into the production build and sent to users' browsers. Each version string begins with `^`, meaning npm accepts any version that is compatible with the listed one (same major version, any higher minor or patch). The seven packages here cover every external capability the application relies on at runtime.

```json
"dependencies": {
  "@supabase/supabase-js": "^2.106.0",
  "date-fns":              "^4.2.1",
  "lucide-react":          "^1.16.0",
  "react":                 "^19.2.6",
  "react-dom":             "^19.2.6",
  "react-is":              "^19.2.7",
  "react-router-dom":      "^7.15.1"
},
```

`@supabase/supabase-js` is the client library wrapping all database and authentication requests (section 2.7.3). `date-fns` provides the calendar arithmetic functions used throughout the codebase (section 2.3.4 touches on date handling). `lucide-react` is the icon library. `react` and `react-dom` are React itself; `react-dom` is the package that knows how to translate React's virtual descriptions into real DOM operations. `react-is` is a peer dependency required by certain React internals. `react-router-dom` provides the routing layer (section 2.4.8 and the App.jsx discussion in section 4.1.2.3).

**Development dependencies.**
The `"devDependencies"` block lists packages used only during development and building; they are never included in the production bundle shipped to users. The list includes Vite itself, the Vite plugins for React and Tailwind, the ESLint toolchain, and TypeScript type definitions for React. The type definitions (`@types/react`, `@types/react-dom`) provide IDE autocompletion even though this project is written in plain JavaScript without TypeScript.

```json
"devDependencies": {
  "@eslint/js":                "^10.0.1",
  "@tailwindcss/vite":         "^4.3.0",
  "@types/react":              "^19.2.14",
  "@types/react-dom":          "^19.2.3",
  "@vitejs/plugin-react":      "^6.0.1",
  ...
  "tailwindcss":               "^4.3.0",
  "vite":                      "^8.0.12"
},
```

---

### 4.2.2  vite.config.js

`vite.config.js` is Vite's configuration file. It is a JavaScript module that exports a configuration object via Vite's `defineConfig` helper. Section 2.6 explains Vite's role: it translates JSX, bundles the source files and packages, and serves the development server. The config file is where plugins that extend that behaviour are registered.

```js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  ...
  optimizeDeps: {
    include: ['recharts', 'react-is'],
  },
})
```

**The plugins array.**
Two plugins are registered. `react()` from `@vitejs/plugin-react` does two things: it transforms JSX syntax into JavaScript that browsers can run, and it enables React Fast Refresh, the mechanism that pushes component changes into the running browser without a full page reload during development. `tailwindcss()` from `@tailwindcss/vite` integrates Tailwind CSS v4 directly into Vite's pipeline, scanning source files for class names and generating the stylesheet on demand. Section 2.5.3 explains how this scanning works.

**The optimizeDeps entry.**
`optimizeDeps.include` tells Vite to pre-bundle the listed packages when the development server starts, rather than transforming them on first request. `react-is` is a valid runtime dependency listed in `package.json`. `recharts` appears here as a leftover from an earlier version of the project: ARCHITECTURE.md notes that recharts was removed due to a Vite 8 and React 19 incompatibility. The entry has no effect since recharts is no longer installed, but it causes no harm either.

---

### 4.2.3  Tailwind CSS configuration

Unlike the previous two major versions of Tailwind (v2 and v3), Tailwind CSS v4 does not use a separate `tailwind.config.js` file. Readers coming from older tutorials or other projects may look for such a file; it does not exist in this project, and that is by design.

In Tailwind v4, configuration is handled through two mechanisms that are already present in the project. The first is the `@tailwindcss/vite` plugin registered in `vite.config.js` (section 4.2.2), which handles content scanning automatically: it reads the same file graph that Vite builds for bundling and knows which source files to scan for class names without needing an explicit `content` array. The second is the single `@import "tailwindcss"` directive in `src/index.css` (section 4.1.2.2), which activates the Tailwind layer system and makes all utility classes available.

Any project-level customisation in v4, such as adding custom colours or defining design tokens, is done with CSS custom property syntax directly in `index.css` rather than in a JavaScript config object. This project uses no custom configuration beyond what Tailwind provides out of the box, so `index.css` remains a single import line.

---

### 4.2.4  eslint.config.js

`eslint.config.js` configures ESLint, the static analysis tool that reads source files and flags potential bugs and style problems without running the code. Running `npm run lint` invokes it across the whole project; it also integrates with most code editors to show warnings inline while writing. The file uses ESLint's flat config format, introduced in ESLint v9, which represents the configuration as an array of config objects applied in sequence rather than a nested JSON object.

```js
import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [ js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
  },
])
```

**globalIgnores.**
`globalIgnores(['dist'])` tells ESLint to skip the `dist/` folder, which contains the production build output. Linting generated files would produce noise without value.

**The files pattern.**
The `files: ['**/*.{js,jsx}']` pattern scopes the following rules to JavaScript and JSX files only, leaving other file types untouched.

**The three rule sets.**
`js.configs.recommended` applies ESLint's standard JavaScript rules: detecting unused variables, unreachable code, and similar common mistakes. `reactHooks.configs.flat.recommended` enforces the rules of hooks (section 2.4.5): hooks must be called at the top level of a component function, never inside conditions or loops. `reactRefresh.configs.vite` checks that exports from component files are compatible with React Fast Refresh; components that cannot be hot-reloaded would otherwise cause a full page reload on every edit.

**Language options.**
`globals.browser` makes browser-global names (`window`, `document`, `navigator`, `fetch`) known to the linter, preventing false "variable not defined" errors for these built-in values. `ecmaFeatures: { jsx: true }` enables the JSX parser extension so the linter can read files containing JSX syntax.

---

### 4.2.5  index.html

`index.html` is the only HTML file in the project and the only file Vite serves directly without transformation. Every request to the application, regardless of the URL path, returns this one document; React Router then reads the URL client-side and renders the matching page component. Section 2.2.1 explains why our project's HTML body is almost empty.

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    ...
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
```

**The head metadata.**
`charset="UTF-8"` instructs the browser to interpret the document using the UTF-8 character encoding, which supports all international characters. The `favicon.svg` link provides the browser tab icon as a scalable vector file; a single SVG covers all sizes without needing multiple image files. The `viewport` meta tag sets the initial zoom level to match the device's physical width and prevents mobile browsers from zooming out to display a desktop-sized page.

**The body.**
Two elements constitute the entire body. `<div id="root"></div>` is the mount point: `main.jsx` (section 4.1.2.1) targets this element with `document.getElementById('root')` and hands it to React's `createRoot`. Everything the user sees is inserted here by React at runtime; the div itself is empty when the HTML is first sent.

`<script type="module" src="/src/main.jsx">` loads the application. The `type="module"` attribute tells the browser to treat the script as an ES module, enabling `import` syntax in the browser. In development, Vite intercepts this request, transforms the JSX file, and returns the result. In production, the `build` step replaces this reference with the path to the compiled and hashed bundle file; the HTML file itself is rewritten as part of the build output.

---

### 4.2.6  .gitignore

`.gitignore` is a plain text file read by Git when deciding which files to include in the repository. Each line is a pattern; files and folders matching any pattern are excluded from all Git operations: they are not tracked, not staged, and not committed. The file has no effect on the running application; it exists purely to keep the repository clean and, critically, to keep secrets out.

The file contains patterns in four groups. Log files (`*.log` and several named variants) are excluded because they contain runtime noise rather than source code. `node_modules`, `dist`, and `dist-ssr` are excluded because they are outputs rather than inputs: `node_modules` is the downloaded package directory (section 2.6.1), and `dist` and `dist-ssr` are Vite's production build outputs. All three can be regenerated from the source files and `package.json`.

```
node_modules
dist
dist-ssr
*.local
```

The `*.local` pattern is the most security-critical line in the file. It matches any file whose name ends in `.local`, which includes `.env.local`, the file holding the Supabase project URL and the anon key (section 2.6.3). If `.env.local` were committed to the repository, its contents would be visible to anyone with read access to the repository on GitHub and would persist in the commit history permanently even if later deleted. Section 2.9 explains what protections remain if the anon key is exposed, but the `.gitignore` entry ensures the question never arises in practice.

The final group covers editor-specific directories and temporary files: `.vscode/*` (with an exception for the shared `.vscode/extensions.json` file, which contains extension recommendations useful to collaborators), `.idea` (JetBrains IDEs), `.DS_Store` (macOS folder metadata), and several Visual Studio and Vim temporary file extensions. These vary by developer and should not become part of the shared project history.
