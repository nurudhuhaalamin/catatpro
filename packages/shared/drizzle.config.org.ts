import { defineConfig } from "drizzle-kit";

// Skema data plane OrgDO (satu SQLite per organisasi, di dalam Durable
// Object). Migrasi TIDAK diterapkan via wrangler CLI — file .sql yang
// dihasilkan di `out` di-bundle & dijalankan oleh
// drizzle-orm/durable-sqlite/migrator saat OrgDO pertama kali diinstansiasi
// (lihat apps/api/src/durable-objects/org-do.ts).
export default defineConfig({
  dialect: "sqlite",
  schema: "./src/schema.org.ts",
  out: "./drizzle/org-migrations",
  casing: "snake_case",
});
