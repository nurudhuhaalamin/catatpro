import { Hono } from "hono";
import { assetCreateSchema, depreciateSchema } from "@catatpro/shared";
import type { AppContext } from "../env.js";
import { requireAuth, requireOrg } from "../middleware.js";
import { getOrgStub } from "../durable-objects/dispatch.js";

const app = new Hono<AppContext>();

// Daftar aset + nilai buku & angsuran/bln.
app.get("/:orgId/assets", requireAuth, requireOrg("viewer"), async (c) => {
  const orgId = c.req.param("orgId");
  return c.json(await getOrgStub(c.env, orgId).listAssets(orgId));
});

// Daftarkan aset (akun default dari COA).
app.post("/:orgId/assets", requireAuth, requireOrg("pencatat"), async (c) => {
  const orgId = c.req.param("orgId");
  const parsed = assetCreateSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: "Aset tidak valid", details: parsed.error.flatten() }, 400);
  try {
    const row = await getOrgStub(c.env, orgId).createAsset(orgId, parsed.data);
    return c.json(row, 201);
  } catch (err) {
    return c.json({ error: (err as Error).message }, 400);
  }
});

// Jalankan penyusutan: Dr Beban Penyusutan / Cr Akumulasi Penyusutan.
app.post("/:orgId/assets/:assetId/depreciate", requireAuth, requireOrg("pencatat"), async (c) => {
  const orgId = c.req.param("orgId");
  const assetId = c.req.param("assetId");
  const parsed = depreciateSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: "Input tidak valid", details: parsed.error.flatten() }, 400);
  try {
    const stub = getOrgStub(c.env, orgId);
    const result = await stub.depreciateAsset(orgId, assetId, parsed.data, c.var.user.id);
    return c.json(result, 201);
  } catch (err) {
    return c.json({ error: (err as Error).message }, 400);
  }
});

export default app;
