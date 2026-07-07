#!/usr/bin/env node
/**
 * PreToolUse guard for Bash commands — Financieel project.
 *
 * Claude Code pipes the tool-call JSON to stdin. Exit code 2 BLOCKS the call
 * and feeds stderr back to Claude as the reason. Exit code 0 allows it.
 *
 * This is the deterministic backstop for rules that must hold 100% of the
 * time (CLAUDE.md instructions are advisory; this is not).
 */

let raw = "";
process.stdin.on("data", (d) => (raw += d));
process.stdin.on("end", () => {
  let cmd = "";
  try {
    const input = JSON.parse(raw);
    cmd = String(input.tool_input?.command ?? "");
  } catch {
    // If we can't parse, fail open (allow) — never brick the session.
    process.exit(0);
  }

  const c = cmd.toLowerCase();

  const rules = [
    {
      // Force pushes — never allowed in this repo (two-person, unenforced protection)
      test: /git\s+push\b[^\n]*(--force|--force-with-lease|\s-f\b)/,
      msg: "BLOCKED: force-push is forbidden in this repo (see CLAUDE.md rule 4).",
    },
    {
      // Direct pushes to main — must go through a b/ branch + PR
      test: /git\s+push\b[^\n]*\b(origin\s+(main|head:main)|main)\b/,
      msg: "BLOCKED: never push directly to main. Push a b/ branch and open a PR (CLAUDE.md rule 4).",
    },
    {
      // Recursive deletes
      test: /\brm\s+-[a-z]*r[a-z]*f|\brm\s+-[a-z]*f[a-z]*r|remove-item\b[^\n]*-recurse[^\n]*-force[^\n]*(\\|\/|\.\.)/,
      msg: "BLOCKED: recursive force-delete. If genuinely needed, ask the owner to run it manually.",
    },
    {
      test: /npm\s+audit\s+fix[^\n]*--force/,
      msg: "BLOCKED: `npm audit fix --force` is explicitly forbidden (CLAUDE.md rule 5 — it can break the build).",
    },
    {
      // Destructive SQL from the shell (psql/supabase cli/etc.)
      test: /\b(drop\s+(table|schema|database)|truncate\s+table|delete\s+from\s+(?!.*where))\b/,
      msg: "BLOCKED: destructive SQL. Schema/data changes follow the db-migration skill with owner approval.",
    },
    {
      test: /git\s+(reset\s+--hard[^\n]*origin|clean\s+-[a-z]*f)/,
      msg: "BLOCKED: hard reset to remote / force clean can destroy local work. Ask the owner first.",
    },
  ];

  for (const r of rules) {
    if (r.test.test(c)) {
      process.stderr.write(r.msg + "\n");
      process.exit(2);
    }
  }
  process.exit(0);
});
