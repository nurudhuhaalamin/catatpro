import { useEffect, useState } from "react";

/** Sesi login sederhana berbasis JWT kustom (menggantikan Supabase Auth). */
export interface SessionUser {
  id: string;
  email: string;
}

const TOKEN_KEY = "catatpro.token";

function decodeToken(token: string): SessionUser | null {
  try {
    const payloadB64 = token.split(".")[1];
    const payload = JSON.parse(atob(payloadB64.replace(/-/g, "+").replace(/_/g, "/"))) as {
      sub?: string;
      email?: string;
      exp?: number;
    };
    if (!payload.sub || !payload.email) return null;
    if (payload.exp && payload.exp * 1000 < Date.now()) return null;
    return { id: payload.sub, email: payload.email };
  } catch {
    return null;
  }
}

function readStoredSession(): SessionUser | null {
  const token = localStorage.getItem(TOKEN_KEY);
  return token ? decodeToken(token) : null;
}

/** Token akses saat ini (untuk header Authorization API). */
export async function getAccessToken(): Promise<string | null> {
  return localStorage.getItem(TOKEN_KEY);
}

/** Hook sesi. `undefined` = sedang memuat, `null` = belum login. */
export function useSession(): SessionUser | null | undefined {
  const [session, setSession] = useState<SessionUser | null | undefined>(() => readStoredSession());
  useEffect(() => {
    const onStorage = () => setSession(readStoredSession());
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);
  return session;
}

interface AuthResponse {
  token: string;
  user: SessionUser;
}

async function authRequest(path: "/auth/login" | "/auth/signup", email: string, password: string): Promise<SessionUser> {
  const res = await fetch(`/api${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const body = (await res.json().catch(() => ({}))) as Partial<AuthResponse> & { error?: string };
  if (!res.ok || !body.token || !body.user) throw new Error(body.error ?? `HTTP ${res.status}`);
  localStorage.setItem(TOKEN_KEY, body.token);
  window.dispatchEvent(new StorageEvent("storage"));
  return body.user;
}

export const login = (email: string, password: string) => authRequest("/auth/login", email, password);
export const signup = (email: string, password: string) => authRequest("/auth/signup", email, password);

export function logout(): void {
  localStorage.removeItem(TOKEN_KEY);
  window.dispatchEvent(new StorageEvent("storage"));
}
