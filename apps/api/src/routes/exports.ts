import { Hono } from "hono";
import { and, eq, isNull, gte, lte, gt, asc } from "drizzle-orm";
import { salesInvoices } from "@catatpro/shared";
import type { AppContext } from "../env.js";
import { requireAuth, requireOrg } from "../middleware.js";

const app = new Hono<AppContext>();

const csvCell = (v: unknown) => {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const rupiah = (cents: number) => (Number(cents) / 100).toFixed(2);

// Ekspor faktur penjualan ber-PPN sebagai CSV (mendekati format impor Coretax).
app.get("/:orgId/exports/efaktur", requireAuth, requireOrg("viewer"), async (c) => {
  const orgId = c.req.param("orgId");
  const from = c.req.query("from") ?? "1900-01-01";
  const to = c.req.query("to") ?? "9999-12-31";
  const rows = await c.var.db
    .select()
    .from(salesInvoices)
    .where(
      and(
        eq(salesInvoices.orgId, orgId),
        isNull(salesInvoices.deletedAt),
        gt(salesInvoices.taxCents, 0),
        gte(salesInvoices.date, from),
        lte(salesInvoices.date, to),
      ),
    )
    .orderBy(asc(salesInvoices.date));

  const header = ["Tanggal", "NomorFaktur", "KodeTransaksi", "NPWP_NIK", "DPP", "PPN", "Total"];
  const lines = rows.map((r) =>
    [r.date, r.number ?? "", r.taxCode ?? "", r.counterpartyNpwp ?? "", rupiah(r.subtotalCents), rupiah(r.taxCents), rupiah(r.totalCents)]
      .map(csvCell)
      .join(","),
  );
  const csv = [header.join(","), ...lines].join("\n");
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="efaktur_${from}_${to}.csv"`,
    },
  });
});

export default app;
