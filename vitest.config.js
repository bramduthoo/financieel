import { defineConfig } from 'vitest/config'

// Dedicated Vitest config, deliberately separate from vite.config.js: the lib/ logic under test
// is pure (no React, no DOM), so we run in the fast `node` environment and skip the app's
// Tailwind/React plugins. Tests import { describe, it, expect, vi } explicitly (no globals) so
// the ESLint flat config needs no test-globals entry.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.js'],
  },
})
