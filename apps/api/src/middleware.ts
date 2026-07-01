import { createMiddleware } from "hono/factory";
import { and, eq } from "drizzle-orm";
import { memberships } from "@catatpro/shared";
import type { AppContext } from "./env.js";
import { getControlDb } from "./d1.js";
import { verifyToken } from "./auth.js";

// Wajib login (Bearer token JWT kustom). Mengisi c.var.user atau balas 401.
export const requireAuth = createMiddleware<AppContext>(async (c, next) => {
  const header = c.req.header("Authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return c.json({ error: "Tidak terautentikasi" }, 401);
  try {
    c.set("user", await verifyToken(token, c.env.AUTH_JWT_SECRET));
  } catch {
    return c.json({ error: "Token tidak valid" }, 401);
  }
  await next();
});

// Level akses: viewer < pencatat < admin < owner (sama seperti catat).
const roleRank = { viewer: 0, pencatat: 1, admin: 2, owner: 3 } as const;
export type Role = keyof typeof roleRank;

// Wajib anggota organisasi (param :orgId atau header x-org-id), minimal `minRole`.
// Membership kini dibaca dari D1 (control plane) — satu-satunya gerbang
// otorisasi (RLS Postgres sudah tidak ada; middleware ini yang menggantikannya).
export function requireOrg(minRole: Role = "viewer") {
  return createMiddleware<AppContext>(async (c, next) => {
    const orgId = c.req.param("orgId") ?? c.req.header("x-org-id");
    if (!orgId) return c.json({ error: "org_id wajib (header x-org-id)" }, 400);
    const db = getControlDb(c.env.CATATPRO_DB);
    const membership = await db
      .select()
      .from(memberships)
      .where(and(eq(memberships.orgId, orgId), eq(memberships.userId, c.var.user.id)))
      .get();
    if (!membership) return c.json({ error: "Anda bukan anggota organisasi ini" }, 403);
    if (roleRank[membership.role] < roleRank[minRole]) {
      return c.json({ error: "Peran Anda tidak cukup untuk aksi ini" }, 403);
    }
    c.set("membership", membership);
    await next();
  });
}
