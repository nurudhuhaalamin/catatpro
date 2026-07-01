import { defineConfig } from "drizzle-kit";

// Skema control plane (D1) — users, organizations, memberships. Migrasi
// diterapkan via `wrangler d1 migrations apply catatpro-control`.
export default defineConfig({
  dialect: "sqlite",
  schema: "./src/schema.control.ts",
  out: "./drizzle/control-migrations",
  casing: "snake_case",
});
