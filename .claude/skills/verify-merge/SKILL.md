---
name: verify-merge
description: Post-merge verification checklist for the financieel repo. ALWAYS run this after any git merge, git pull of main, rebase, or PR merge — even if the build passes and the merge "looked clean". This project has shipped committed conflict markers, silently dropped imports, and variable-name mismatches that compiled but white-screened the app at runtime. A green build proves nothing here.
---

# Verify Merge

Run every step. Do not skip steps because earlier ones passed — the historical failures were
exactly the ones a green build hid.

## 1. Committed conflict markers

```
git grep -l "<<<<<<< HEAD"
git grep -l ">>>>>>>"
```

**Exit code 1 with empty output is the GOOD result** (nothing found). Exit code 0 means markers
are committed — list the files, and stop here until they're resolved.

## 2. Dropped imports & undefined references

For every file changed by the merge (`git diff --name-only <pre-merge-sha>..HEAD`, or
`git diff --name-only HEAD~1..HEAD` if unsure):

- Read the file and check that every identifier used (components, icons, helpers) has a
  matching import. Historical example: merge dropped `TrendingUp` and `AlertCircle` from
  lucide-react imports while keeping their JSX usage.
- Check for variable-name mismatches between declaration and use (historical example: declared
  `comparison`, used `trend` — compiled fine, crashed at runtime).
- If an LSP plugin or `npm run build` is available, run it — but treat it as necessary, not
  sufficient.

## 3. Runtime smoke test

- Start `npm run dev`.
- If a browser tool (Playwright / Chrome DevTools plugin) is available: open
  http://localhost:5173, log in if a test account is configured, visit Dashboard, Wallets, and
  Income pages, and **read the browser console** — any red error fails the check.
- If no browser tool is available: tell the owner exactly which pages to click and to check the
  console, and wait for confirmation.

## 4. Report

Summarize: files scanned, markers found (should be none), import/reference issues found and
fixed, console status. Only after this report may the merge be treated as trusted.
