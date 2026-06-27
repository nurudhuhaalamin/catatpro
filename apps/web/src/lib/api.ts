import { getAccessToken } from "./auth.js";

export interface ApiOptions {
  orgId?: string | null;
  method?: string;
  body?: unknown;
}

/** Pemanggil API: lampirkan token Supabase + header x-org-id. */
export async function apiFetch<T = unknown>(path: string, opts: ApiOptions = {}): Promise<T> {
  const token = await getAccessToken();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (opts.orgId) headers["x-org-id"] = opts.orgId;
  const res = await fetch(`/api${path}`, {
    method: opts.method ?? "GET",
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error ?? `HTTP ${res.status}`);
  }
  return res.status === 204 ? (null as T) : ((await res.json()) as T);
}
