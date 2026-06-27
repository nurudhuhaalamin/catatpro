import { sql } from "drizzle-orm";
import { numberSequences, periodKey, formatDocNumber } from "@catatpro/shared";
import type { DbTx } from "../db.js";

const DEFAULT_PREFIX: Record<string, string> = {
  journal: "JV-",
  sales_invoice: "INV-",
  purchase_bill: "BILL-",
  payment: "PAY-",
};

export interface SeqOptions {
  prefix?: string;
  padding?: number;
  granularity?: "none" | "year" | "month";
}

/**
 * Ambil nomor dokumen berikutnya secara ATOMIK (dalam transaksi pemanggil).
 * UPSERT + increment `number_sequences`; nomor yang diberikan = next_value - 1.
 */
export async function nextDocumentNumber(
  tx: DbTx,
  orgId: string,
  docType: string,
  dateIso: string,
  opts: SeqOptions = {},
): Promise<string> {
  const period = periodKey(dateIso, opts.granularity ?? "year");
  const prefix = opts.prefix ?? DEFAULT_PREFIX[docType] ?? "";
  const padding = opts.padding ?? 4;

  const [row] = await tx
    .insert(numberSequences)
    .values({ orgId, docType, period, prefix, padding, nextValue: 2 })
    .onConflictDoUpdate({
      target: [numberSequences.orgId, numberSequences.docType, numberSequences.period],
      set: { nextValue: sql`${numberSequences.nextValue} + 1`, updatedAt: new Date() },
    })
    .returning();

  const assigned = row.nextValue - 1;
  return formatDocNumber(row.prefix, row.period, assigned, row.padding);
}
