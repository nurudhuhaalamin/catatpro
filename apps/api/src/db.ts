import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { schema } from "@catatpro/shared";

/**
 * Klien Drizzle untuk Supabase Postgres.
 * Pakai connection string POOLER (Supavisor/pgBouncer, port 6543, mode transaction)
 * di produksi. `prepare: false` wajib untuk pgBouncer transaction pooling.
 */
let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;

export function getDb() {
  if (_db) return _db;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL belum di-set");
  const client = postgres(url, { prepare: false });
  _db = drizzle(client, { schema, casing: "snake_case" });
  return _db;
}

export type Db = ReturnType<typeof getDb>;
