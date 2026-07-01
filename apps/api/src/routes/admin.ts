import { Hono } from "hono";
import type { AppContext } from "../env.js";
import { getOrgStub } from "../durable-objects/dispatch.js";

const app = new Hono<AppContext>();

/**
 * MIGRASI-SAJA: terima dump JSON satu org (hasil ekspor dari Supabase) dan
 * tulis mentah ke OrgDO-nya, lewat `stub.restoreFromDump`. Dijaga secret
 * migrasi (BUKAN JWT user biasa) — HAPUS rute ini + `MIGRATION_ADMIN_SECRET`
 * + `OrgDO.restoreFromDump` setelah migrasi selesai diverifikasi.
 */
app.post("/orgs/:orgId/seed-raw", async (c) => {
  const secret = c.env.MIGRATION_ADMIN_SECRET;
  const given = c.req.header("x-migration-secret");
  if (!secret || !given || given !== secret) return c.json({ error: "Tidak diizinkan" }, 403);

  const orgId = c.req.param("orgId");
  const dump = await c.req.json().catch(() => null);
  if (!dump || typeof dump !== "object") return c.json({ error: "Dump tidak valid" }, 400);

  try {
    const stub = getOrgStub(c.env, orgId);
    const result = await stub.restoreFromDump(orgId, dump);
    return c.json(result, 201);
  } catch (err) {
    return c.json({ error: (err as Error).message }, 400);
  }
});

export default app;
