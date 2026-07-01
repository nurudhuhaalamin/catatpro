import { SignJWT, jwtVerify } from "jose";

/**
 * Auth kustom (menggantikan Supabase Auth): hashing password PBKDF2 via
 * Web Crypto (`crypto.subtle`, native di Workers — tanpa WASM/bcrypt) + JWT
 * HS256 (via `jose`, secret dari `env.AUTH_JWT_SECRET`).
 */
export interface AuthUser {
  id: string;
  email: string;
}

const PBKDF2_ITERATIONS = 210_000; // rekomendasi OWASP 2023 untuk PBKDF2-SHA256
const KEY_LEN_BITS = 256;

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function deriveBits(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt: salt as BufferSource, iterations, hash: "SHA-256" }, key, KEY_LEN_BITS);
  return new Uint8Array(bits);
}

/** Hash password baru — format tersimpan: `pbkdf2$<iterasi>$<saltB64>$<hashB64>`. */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const bits = await deriveBits(password, salt, PBKDF2_ITERATIONS);
  return `pbkdf2$${PBKDF2_ITERATIONS}$${toBase64(salt)}$${toBase64(bits)}`;
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

/** Verifikasi password terhadap hash tersimpan (baca iterasi dari hash, bukan konstanta). */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 4 || parts[0] !== "pbkdf2") return false;
  const [, iterStr, saltB64, hashB64] = parts;
  const salt = fromBase64(saltB64);
  const expected = fromBase64(hashB64);
  const actual = await deriveBits(password, salt, Number(iterStr));
  return timingSafeEqual(actual, expected);
}

const encoder = new TextEncoder();

/** Terbitkan JWT HS256 untuk user (stateless, tanpa refresh-token — expiry 30 hari). */
export async function issueToken(user: AuthUser, secret: string): Promise<string> {
  return new SignJWT({ email: user.email })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(encoder.encode(secret));
}

/** Verifikasi JWT HS256 (satu-satunya skema — tanpa fallback JWKS/Supabase). */
export async function verifyToken(token: string, secret: string): Promise<AuthUser> {
  const { payload } = await jwtVerify(token, encoder.encode(secret));
  if (!payload.sub) throw new Error("Token tanpa subject");
  if (typeof payload.email !== "string") throw new Error("Token tanpa email");
  return { id: payload.sub, email: payload.email };
}
