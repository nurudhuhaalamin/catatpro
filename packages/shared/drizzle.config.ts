import { defineConfig } from "drizzle-kit";

// Skema CatatPro untuk Postgres (Supabase). DATABASE_URL diisi saat menjalankan
// `drizzle-kit generate`/`migrate` (lihat .env.example). Migrasi ditulis ke ../../supabase/migrations.
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema.ts",
  out: "../../supabase/migrations",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://localhost:5432/catatpro",
  },
  casing: "snake_case",
});
