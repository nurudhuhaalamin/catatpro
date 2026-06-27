import { journals, journalLines, type DraftJournal } from "@catatpro/shared";
import type { DbTx } from "../db.js";

/** Tulis satu jurnal berimbang (header + baris) secara atomik; kembalikan id jurnal. */
export async function insertDraftJournal(
  tx: DbTx,
  orgId: string,
  draft: DraftJournal,
  opts: { createdBy?: string | null; sourceId?: string | null; number?: string | null } = {},
): Promise<string> {
  const [j] = await tx
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
    .returning({ id: journals.id });

  await tx.insert(journalLines).values(
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
  );
  return j.id;
}
