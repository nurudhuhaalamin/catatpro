import { drizzle } from "drizzle-orm/durable-sqlite";
import { orgSchema } from "@catatpro/shared";

/**
 * Klien Drizzle untuk storage SQLite milik SATU OrgDO (satu organisasi).
 * `db.transaction(cb)` di sini adalah SINKRON (backed oleh
 * `DurableObjectStorage.transactionSync`) — callback WAJIB bukan fungsi
 * `async` dan TIDAK boleh memakai `await` di dalamnya; pakai method
 * terminal sinkron Drizzle (`.all()`, `.get()`, `.run()`) untuk
 * mengeksekusi query. Ini memastikan seluruh transaksi benar-benar atomik
 * (rollback penuh bila terjadi throw), berbeda dari pendekatan async/await
 * ala postgres-js yang dipakai sebelumnya.
 */
export function createOrgDb(storage: DurableObjectStorage) {
  return drizzle(storage, { schema: orgSchema, casing: "snake_case" });
}

export type OrgDb = ReturnType<typeof createOrgDb>;
export type OrgDbTx = Parameters<Parameters<OrgDb["transaction"]>[0]>[0];
