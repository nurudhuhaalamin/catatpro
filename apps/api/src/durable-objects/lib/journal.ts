import { journals, journalLines, type DraftJournal } from "@catatpro/shared";
import type { OrgDbTx } from "../db.js";

/** Tulis satu jurnal berimbang (header + baris) secara atomik; kembalikan id jurnal. */
export function insertDraftJournal(
  tx: OrgDbTx,
  orgId: string,
  draft: DraftJournal,
  opts: { createdBy?: string | null; sourceId?: string | null; number?: string | null } = {},
): string {
  const [j] = tx
    .insert(journals)
    .values({
      orgId,
      number: opts.number ?? null,
      date: draft.date,
      sourceType: draft.sourceType,
      sourceId: opts.sourceId ?? draft.sourceId ?? null,
      status: "posted",
      memo: draft.memo,
      createdBy: opts.createdBy ?? null,
      postedAt: new Date(),
    })
    .returning({ id: journals.id })
    .all();

  tx.insert(journalLines)
    .values(
      draft.lines.map((l, idx) => ({
        orgId,
        journalId: j.id,
        accountId: l.accountId,
        debitCents: l.debitCents,
        creditCents: l.creditCents,
        contactId: l.contactId ?? null,
        memo: l.memo ?? null,
        lineNo: idx,
      })),
    )
    .run();
  return j.id;
}
