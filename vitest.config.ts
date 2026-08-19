import { defineConfig, configDefaults } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

// The `*.integration.test.ts` suites all run against ONE shared local Supabase database.
// Most scope themselves with a unique per-run key (`TAG-${Date.now()}`), but they still
// share a single database and its connection pool, and a few share fixed singleton rows
// (e.g. the bundle CMS `bundle_key = "discovery"`, hardcoded in the service). Running them
// in parallel workers therefore produces intermittent, timing-dependent cross-file failures
// — one file's delete/publish racing another's assertions, or transient contention on the
// shared connection pool (a different suite fails on each run). Serializing the integration
// suites (never parallel, one DB writer at a time) makes them deterministic. The fast
// unit/component suites carry no shared external state and keep running in parallel, so the
// split costs little wall-clock. No production code and no test assertions change.
const INTEGRATION_GLOB = "src/**/*.integration.test.ts";

export default defineConfig({
  // React plugin enables JSX/TSX transform for rendered component tests (e.g. the Bundle preview
  // isolation test). Node-environment unit tests are unaffected.
  plugins: [react()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    // Shared by both projects via `extends: true`.
    environment: "node",
    setupFiles: ["./src/test/setup.ts"],
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          include: ["src/**/*.test.ts"],
          exclude: [...configDefaults.exclude, INTEGRATION_GLOB],
        },
      },
      {
        // Integration suites hit the shared local database — serialized (never parallel)
        // so they cannot race each other on shared rows or exhaust the connection pool.
        extends: true,
        test: {
          name: "integration",
          include: [INTEGRATION_GLOB],
          fileParallelism: false,
        },
      },
    ],
  },
});
