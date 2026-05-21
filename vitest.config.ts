import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    exclude: [
      "**/node_modules/**",
      "**/.claude/worktrees/**",
      "**/.gbrain/**",
      "**/.openclaw/**",
    ],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
      // `server-only` is a Next.js marker module — stub it for vitest so any
      // file importing it (e.g. lib/session.ts, lib/subscription.ts) can be
      // pulled into a test without exploding.
      "server-only": path.resolve(__dirname, "lib/__tests__/__stubs__/server-only.ts"),
    },
  },
});
