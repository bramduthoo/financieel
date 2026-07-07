#!/usr/bin/env node
/**
 * PostToolUse formatter for Edit/Write/MultiEdit — Financieel project.
 *
 * Claude Code pipes the tool-call JSON to stdin. This reads the edited file
 * path from `tool_input.file_path` and, if it's a JS/JSX source file in the
 * repo, runs `eslint --fix` on it (the repo has ESLint but no Prettier).
 *
 * NON-BLOCKING BY DESIGN: it always exits 0. A lint hook must never fail an
 * edit — that would strand Claude mid-task. Lint *errors* still surface via
 * `npm run lint`; this hook only applies the auto-fixable subset.
 */

const { spawnSync } = require("node:child_process");
const path = require("node:path");

let raw = "";
process.stdin.on("data", (d) => (raw += d));
process.stdin.on("end", () => {
  let filePath = "";
  try {
    const input = JSON.parse(raw);
    filePath = String(input.tool_input?.file_path ?? "");
  } catch {
    process.exit(0); // unparseable payload — do nothing, never block
  }

  if (!filePath) process.exit(0);

  // Only lint JS/JSX. Skip dependencies and build output.
  if (!/\.(js|jsx)$/i.test(filePath)) process.exit(0);
  const normalized = filePath.replace(/\\/g, "/");
  if (/\/(node_modules|dist)\//i.test(normalized)) process.exit(0);

  // shell:true so `npx` resolves to npx.cmd on Windows.
  const res = spawnSync("npx", ["eslint", "--fix", path.resolve(filePath)], {
    stdio: "ignore",
    shell: true,
  });

  // Report nothing on success; a short note on spawn failure. Either way exit 0.
  if (res.error) {
    process.stderr.write(`format-edited: eslint could not run (${res.error.message})\n`);
  }
  process.exit(0);
});
