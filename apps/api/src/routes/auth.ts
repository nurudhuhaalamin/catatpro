import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { users, authCredentialsSchema } from "@catatpro/shared";
import type { AppContext } from "../env.js";
import { getControlDb } from "../d1.js";
import { hashPassword, verifyPassword, issueToken } from "../auth.js";

const app = new Hono<AppContext>();

app.post("/signup", async (c) => {
  const parsed = authCredentialsSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: "Email/kata sandi tidak valid", details: parsed.error.flatten() }, 400);
  const { email, password } = parsed.data;

  const db = getControlDb(c.env.CATATPRO_DB);
  const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).get();
  if (existing) return c.json({ error: "Email sudah terdaftar" }, 409);

  const passwordHash = await hashPassword(password);
  const [user] = await db.insert(users).values({ email, passwordHash }).returning();
  const token = await issueToken({ id: user.id, email: user.email }, c.env.AUTH_JWT_SECRET);
  return c.json({ token, user: { id: user.id, email: user.email } }, 201);
});

app.post("/login", async (c) => {
  const parsed = authCredentialsSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: "Email/kata sandi tidak valid" }, 400);
  const { email, password } = parsed.data;

  const db = getControlDb(c.env.CATATPRO_DB);
  const user = await db.select().from(users).where(eq(users.email, email)).get();
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    return c.json({ error: "Email atau kata sandi salah" }, 401);
  }
  const token = await issueToken({ id: user.id, email: user.email }, c.env.AUTH_JWT_SECRET);
  return c.json({ token, user: { id: user.id, email: user.email } });
});

export default app;
