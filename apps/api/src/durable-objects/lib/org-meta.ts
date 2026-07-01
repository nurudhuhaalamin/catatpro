import { eq } from "drizzle-orm";
import { orgMeta } from "@catatpro/shared";
import type { OrgDbTx } from "../db.js";

/**
 * Metadata org yang di-cache lokal di storage OrgDO (mis. baseCurrency,
 * accountingStandard, seededAt) — dipakai supaya OrgDO tidak perlu memanggil
 * balik ke D1 (control plane) untuk data organisasi yang jarang berubah.
 * Diisi sekali saat `seedOrg()` (lihat org-do.ts).
 */
export function readOrgMeta(tx: OrgDbTx, key: string): string | null {
  const row = tx.select({ value: orgMeta.value }).from(orgMeta).where(eq(orgMeta.key, key)).get();
  return row?.value ?? null;
}

export function writeOrgMeta(tx: OrgDbTx, key: string, value: string): void {
  tx.insert(orgMeta)
    .values({ key, value })
    .onConflictDoUpdate({ target: orgMeta.key, set: { value } })
    .run();
}
