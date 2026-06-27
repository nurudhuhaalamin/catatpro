import { jwtVerify, createRemoteJWKSet, type JWTPayload } from "jose";

/**
 * Verifikasi JWT Supabase Auth. Mendukung DUA mode (otomatis):
 *  - **Asimetris (ES256/RS256)** via JWKS — project Supabase baru memakai signing keys.
 *  - **Simetris (HS256)** via SUPABASE_JWT_SECRET — project lama / legacy.
 * API mempercayai identitas ini lalu memeriksa membership (defense-in-depth bersama RLS).
 */
export interface AuthUser {
  id: string;
  email?: string;
}

export interface VerifyOptions {
  secret?: string;
  supabaseUrl?: string;
}

// Cache JWKS per isolate (createRemoteJWKSet mengelola cache internal + fetch).
let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;
let jwksUrl = "";

function toUser(payload: JWTPayload): AuthUser {
  if (!payload.sub) throw new Error("Token tanpa subject");
  return { id: payload.sub, email: typeof payload.email === "string" ? payload.email : undefined };
}

export async function verifyToken(token: string, opts: VerifyOptions): Promise<AuthUser> {
  // 1) Coba JWKS (asimetris) bila URL Supabase tersedia.
  if (opts.supabaseUrl) {
    try {
      const url = `${opts.supabaseUrl}/auth/v1/.well-known/jwks.json`;
      if (!jwks || jwksUrl !== url) {
        jwks = createRemoteJWKSet(new URL(url));
        jwksUrl = url;
      }
      const { payload } = await jwtVerify(token, jwks);
      return toUser(payload);
    } catch {
      // lanjut ke HS256 (mis. token HS256 / JWKS tak cocok)
    }
  }
  // 2) Fallback simetris (HS256) dengan shared secret.
  if (opts.secret) {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(opts.secret));
    return toUser(payload);
  }
  throw new Error("Tidak ada metode verifikasi token yang dikonfigurasi");
}
