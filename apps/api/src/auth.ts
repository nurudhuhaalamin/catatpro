import { jwtVerify } from "jose";

/**
 * Verifikasi JWT Supabase Auth (HS256, ditandatangani dengan SUPABASE_JWT_SECRET).
 * Mengembalikan user id (sub) & email. API mempercayai identitas ini lalu
 * memeriksa membership organisasi sendiri (defense-in-depth bersama RLS).
 */
export interface AuthUser {
  id: string;
  email?: string;
}

export async function verifyToken(token: string, secret: string): Promise<AuthUser> {
  if (!secret) throw new Error("SUPABASE_JWT_SECRET belum di-set");
  const { payload } = await jwtVerify(token, new TextEncoder().encode(secret));
  if (!payload.sub) throw new Error("Token tanpa subject");
  return { id: payload.sub, email: typeof payload.email === "string" ? payload.email : undefined };
}
