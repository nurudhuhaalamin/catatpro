import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { schema } from "@catatpro/shared";

/**
 * Klien Drizzle untuk Supabase Postgres.
 * Pakai connection string POOLER (Supavisor/pgBouncer, port 6543, mode transaction)
 * di produksi. `prepare: false` wajib untuk pgBouncer transaction pooling.
 */
// Cache klien per connection string (dipakai ulang antar request dalam isolate yang sama).
const cache = new Map<string, ReturnType<typeof drizzle<typeof schema>>>();

export function getDb(connectionString: string) {
  let db = cache.get(connectionString);
  if (!db) {
    const client = postgres(connectionString, { prepare: false });
    db = drizzle(client, { schema, casing: "snake_case" });
    cache.set(connectionString, db);
  }
  return db;
}

export type Db = ReturnType<typeof getDb>;
// Tipe transaksi Drizzle (parameter callback db.transaction).
export type DbTx = Parameters<Parameters<Db["transaction"]>[0]>[0];
