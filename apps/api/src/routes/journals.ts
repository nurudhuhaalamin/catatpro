import { Hono } from "hono";
import { and, eq, sql } from "drizzle-orm";
import {
  journals,
  journalLines,
  accounts,
  journalCreateSchema,
  buildManualJournal,
} from "@catatpro/shared";
import type { AppContext } from "../env.js";
import { requireAuth, requireOrg } from "../middleware.js";

const app = new Hono<AppContext>();

// Posting jurnal manual (mode pro). Atomik: header + baris dalam satu transaksi.
app.post("/:orgId/journals", requireAuth, requireOrg("pencatat"), async (c) => {
  const orgId = c.req.param("orgId");
  const body = await c.req.json().catch(() => ({}));
  const parsed = journalCreateSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: "Jurnal tidak valid", details: parsed.error.flatten() }, 400);

  // Validasi invarian double-entry sekali lagi via posting service.
  const draft = buildManualJournal(
    parsed.data.date,
    parsed.data.lines.map((l) => ({
      accountId: l.accountId,
      debitCents: l.debitCents,
      creditCents: l.creditCents,
      contactId: l.contactId ?? null,
      memo: l.memo ?? null,
    })),
    parsed.data.memo,
  );

  const journal = await c.var.db.transaction(async (tx) => {
    const [j] = await tx
      .insert(journals)
      .values({
        orgId,
        date: draft.date,
        sourceType: draft.sourceType,
        status: "posted",
        memo: draft.memo,
        createdBy: c.var.user.id,
        clientId: parsed.data.clientId ?? null,
        postedAt: new Date(),
      })
      .returning();

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

    return j;
  });

  return c.json(journal, 201);
});

// Neraca saldo: agregasi journal_lines per akun (diturunkan dari buku besar).
app.get("/:orgId/trial-balance", requireAuth, requireOrg("viewer"), async (c) => {
  const orgId = c.req.param("orgId");
  const rows = await c.var.db
    .select({
      accountId: accounts.id,
      code: accounts.code,
      name: accounts.name,
      type: accounts.type,
      debitCents: sql<number>`COALESCE(SUM(${journalLines.debitCents}), 0)`,
      creditCents: sql<number>`COALESCE(SUM(${journalLines.creditCents}), 0)`,
    })
    .from(accounts)
    .leftJoin(journalLines, eq(journalLines.accountId, accounts.id))
    .where(and(eq(accounts.orgId, orgId)))
    .groupBy(accounts.id, accounts.code, accounts.name, accounts.type)
    .orderBy(accounts.code);

  const data = rows.map((r) => ({
    ...r,
    debitCents: Number(r.debitCents),
    creditCents: Number(r.creditCents),
    balanceCents: Number(r.debitCents) - Number(r.creditCents),
  }));
  const totalDebit = data.reduce((s, r) => s + r.debitCents, 0);
  const totalCredit = data.reduce((s, r) => s + r.creditCents, 0);
  return c.json({ rows: data, totalDebit, totalCredit, balanced: totalDebit === totalCredit });
});

export default app;
