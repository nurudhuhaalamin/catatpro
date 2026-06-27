import { Hono } from "hono";
import { and, eq, isNull } from "drizzle-orm";
import {
  organizations,
  memberships,
  accounts,
  taxRates,
  coaTemplate,
  orgCreateSchema,
  type OrgWithRole,
} from "@catatpro/shared";
import type { AppContext } from "../env.js";
import { requireAuth } from "../middleware.js";

const app = new Hono<AppContext>();

// Daftar organisasi milik / yang diikuti user, beserta perannya.
app.get("/", requireAuth, async (c) => {
  const rows = await c.var.db
    .select({ org: organizations, role: memberships.role })
    .from(memberships)
    .innerJoin(organizations, eq(memberships.orgId, organizations.id))
    .where(and(eq(memberships.userId, c.var.user.id), isNull(organizations.deletedAt)));
  const result: OrgWithRole[] = rows.map((r) => ({ ...r.org, role: r.role }));
  return c.json(result);
});

// Buat organisasi baru: seed COA sesuai standar + tarif PPN default + owner membership.
app.post("/", requireAuth, async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const parsed = orgCreateSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: "Payload tidak valid", details: parsed.error.flatten() }, 400);
  const { name, accountingStandard, baseCurrency, npwp } = parsed.data;
  const userId = c.var.user.id;

  const org = await c.var.db.transaction(async (tx) => {
    const [created] = await tx
      .insert(organizations)
      .values({ name, ownerUserId: userId, accountingStandard, baseCurrency, npwp: npwp ?? null })
      .returning();

    await tx.insert(memberships).values({ orgId: created.id, userId, role: "owner" });

    const coaRows = coaTemplate(accountingStandard).map((a) => ({
      orgId: created.id,
      code: a.code,
      name: a.name,
      type: a.type,
      subtype: a.subtype,
      normalBalance: a.normalBalance,
    }));
    const insertedAccounts = await tx.insert(accounts).values(coaRows).returning();

    // Tarif PPN 2026: 12% dengan DPP Nilai Lain 11/12 (efektif 11%).
    const taxOutput = insertedAccounts.find((a) => a.subtype === "tax_output");
    await tx.insert(taxRates).values({
      orgId: created.id,
      name: "PPN 12% (DPP 11/12)",
      appliesTo: "both",
      rateBps: 1200,
      dppFactorNum: 11,
      dppFactorDen: 12,
      accountId: taxOutput?.id ?? null,
      validFrom: "2025-01-01",
    });

    return created;
  });

  return c.json(org, 201);
});

export default app;
