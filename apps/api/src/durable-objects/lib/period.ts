import { and, eq, lte, gte } from "drizzle-orm";
import { accountingPeriods } from "@catatpro/shared";
import type { OrgDbTx } from "../db.js";

/**
 * Pastikan tanggal posting tidak jatuh di periode yang sudah ditutup/dikunci.
 * Periode bersifat opsional: bila tak ada periode mencakup tanggal, posting diizinkan.
 */
export function assertPeriodOpen(tx: OrgDbTx, orgId: string, dateIso: string): void {
  const p = tx
    .select({ name: accountingPeriods.name, status: accountingPeriods.status })
    .from(accountingPeriods)
    .where(
      and(
        eq(accountingPeriods.orgId, orgId),
        lte(accountingPeriods.startDate, dateIso),
        gte(accountingPeriods.endDate, dateIso),
      ),
    )
    .get();
  if (p && (p.status === "closed" || p.status === "locked")) {
    throw new Error(`Periode "${p.name}" sudah ${p.status === "locked" ? "dikunci" : "ditutup"}; posting ditolak`);
  }
}
