import { eq } from "drizzle-orm";
import { journals, buildManualJournal, type JournalCreate } from "@catatpro/shared";
import type { OrgDbTx } from "../db.js";
import { assertPeriodOpen } from "../lib/period.js";
import { insertDraftJournal } from "../lib/journal.js";

// Posting jurnal manual (mode pro). Validasi invarian double-entry sekali lagi
// via posting service sebelum ditulis.
export function createManualJournal(tx: OrgDbTx, orgId: string, d: JournalCreate, userId: string) {
  const draft = buildManualJournal(
    d.date,
    d.lines.map((l) => ({
      accountId: l.accountId,
      debitCents: l.debitCents,
      creditCents: l.creditCents,
      contactId: l.contactId ?? null,
      memo: l.memo ?? null,
    })),
    d.memo,
  );
  assertPeriodOpen(tx, orgId, draft.date);
  const journalId = insertDraftJournal(tx, orgId, draft, { createdBy: userId, sourceId: null });
  return tx.select().from(journals).where(eq(journals.id, journalId)).get();
}
