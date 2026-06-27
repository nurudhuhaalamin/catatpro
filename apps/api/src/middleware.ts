import { createMiddleware } from "hono/factory";
import { and, eq } from "drizzle-orm";
import { memberships } from "@catatpro/shared";
import type { AppContext } from "./env.js";
import { getDb } from "./db.js";
import { verifyToken } from "./auth.js";

// Sumber konfigurasi: binding Workers (c.env) dengan fallback process.env (Node dev).
const dbUrl = (c: { env: AppContext["Bindings"] }) =>
  c.env?.HYPERDRIVE?.connectionString ?? c.env?.DATABASE_URL ?? process.env.DATABASE_URL;
const jwtSecret = (c: { env: AppContext["Bindings"] }) =>
  c.env?.SUPABASE_JWT_SECRET ?? process.env.SUPABASE_JWT_SECRET;

// Pasang db ke context tiap request.
export const withDb = createMiddleware<AppContext>(async (c, next) => {
  const conn = dbUrl(c);
  if (!conn) return c.json({ error: "Koneksi database belum dikonfigurasi" }, 500);
  c.set("db", getDb(conn));
  await next();
});

// Wajib login (Bearer token Supabase). Mengisi c.var.user atau balas 401.
export const requireAuth = createMiddleware<AppContext>(async (c, next) => {
  const header = c.req.header("Authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return c.json({ error: "Tidak terautentikasi" }, 401);
  const secret = jwtSecret(c);
  if (!secret) return c.json({ error: "Auth belum dikonfigurasi" }, 500);
  try {
    c.set("user", await verifyToken(token, secret));
  } catch {
    return c.json({ error: "Token tidak valid" }, 401);
  }
  await next();
});

// Level akses: viewer < pencatat < admin < owner (sama seperti catat).
const roleRank = { viewer: 0, pencatat: 1, admin: 2, owner: 3 } as const;
export type Role = keyof typeof roleRank;

// Wajib anggota organisasi (param :orgId atau header x-org-id), minimal `minRole`.
export function requireOrg(minRole: Role = "viewer") {
  return createMiddleware<AppContext>(async (c, next) => {
    const orgId = c.req.param("orgId") ?? c.req.header("x-org-id");
    if (!orgId) return c.json({ error: "org_id wajib (header x-org-id)" }, 400);
    const rows = await c.var.db
      .select()
      .from(memberships)
      .where(and(eq(memberships.orgId, orgId), eq(memberships.userId, c.var.user.id)))
      .limit(1);
    const membership = rows[0];
    if (!membership) return c.json({ error: "Anda bukan anggota organisasi ini" }, 403);
    if (roleRank[membership.role] < roleRank[minRole]) {
      return c.json({ error: "Peran Anda tidak cukup untuk aksi ini" }, 403);
    }
    c.set("membership", membership);
    await next();
  });
}
