# Deploy CatatPro ke Cloudflare (Workers + D1 + Durable Objects + Static Assets)

Satu **Cloudflare Worker** melayani **SPA** (aset statis dari `apps/web/dist`) sekaligus **API**
(`/api/*`). Database sepenuhnya di Cloudflare — **tidak ada dependensi eksternal lagi**
(hanya GitHub + Cloudflare).

## Arsitektur runtime

```
Browser ─▶ Worker catatpro
            ├─ /api/auth/*        → D1 (users) + JWT (jose)
            ├─ /api/orgs (GET/POST) → D1 (organizations, memberships)
            ├─ /api/orgs/:orgId/*  → Durable Object OrgDO (satu per organisasi, SQLite)
            └─ lainnya             → ASSETS (apps/web/dist, fallback index.html)
```

- **D1** (`catatpro-control`): 3 tabel lintas-org — `users`, `organizations`, `memberships`.
- **Durable Objects** (`OrgDO`, SQLite-backed): satu instance per organisasi, menyimpan semua
  data akuntansi (COA, jurnal, faktur, stok, dst). Isolasi tenant penuh + transaksi atomik
  bebas race-condition secara bawaan (satu DO = satu organisasi, request diproses serial).

## Prasyarat (sekali set)

**Akun Cloudflare** + Wrangler login lokal (`npx wrangler login`) atau API token untuk CI.

### 1. Buat database D1 (control plane)

```bash
npx wrangler d1 create catatpro-control
```

Salin `database_id` yang muncul ke `wrangler.toml` (`[[d1_databases]]`).

### 2. Terapkan migrasi D1

```bash
npx wrangler d1 migrations apply catatpro-control --remote
```

(Migrasi ada di `packages/shared/drizzle/control-migrations/`, dibuat via
`pnpm db:generate:control` setelah mengubah `packages/shared/src/schema.control.ts`.)

### 3. Durable Object

Tidak perlu setup terpisah — binding & migrasi kelas (`new_sqlite_classes`) sudah ada di
`wrangler.toml`. Skema tabel di dalam tiap OrgDO dibuat otomatis saat instance pertama kali
dipakai (lihat `apps/api/src/durable-objects/org-do.ts`).

### 4. Secret wajib

```bash
npx wrangler secret put AUTH_JWT_SECRET   # mis. `openssl rand -base64 32`
```

## Deploy manual (lokal)

```bash
pnpm install
pnpm cf:deploy        # build web + wrangler deploy
```

Worker live di `https://catatpro.<subdomain>.workers.dev`. Set `WEB_ORIGIN` di `wrangler.toml`
ke URL itu (untuk CORS, walau same-origin), lalu deploy ulang.

## Deploy otomatis (GitHub Actions)

Workflow `.github/workflows/deploy.yml` deploy tiap push ke `main`: build web → terapkan
migrasi D1 → `wrangler deploy`. Tambah di repo:
- **Secrets**: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`.

> Secret `AUTH_JWT_SECRET` di-set sekali via `wrangler` (bukan di CI), tersimpan di Worker.

## Pengembangan lokal

Salin `.dev.vars.example` → `.dev.vars` di root repo (diisi `AUTH_JWT_SECRET` sembarang untuk
dev). Lalu jalankan:

```bash
pnpm cf:dev      # Worker (API + DO + D1 lokal via Miniflare) di :8787
pnpm dev:web     # Vite (SPA, hot-reload) di :5173, proxy /api → :8787
# atau keduanya sekaligus:
pnpm dev
```

Durable Objects & D1 tidak bisa berjalan di Node biasa — selalu pakai `wrangler dev` (Miniflare)
untuk pengembangan API, bukan `tsx`/`node` langsung.

## Migrasi data dari Supabase (satu kali, opsional)

Bila ada data lama di Supabase yang perlu dipindahkan, lihat `scripts/migrate-from-supabase.ts`
dan `docs/SUPABASE.md` (arsip). Skrip ini manual, tidak dijalankan otomatis oleh CI/CD.

## Verifikasi pasca-deploy

- `GET https://catatpro.<subdomain>.workers.dev/api/health` → `{ ok: true }`.
- Buka root → daftar/login → buat usaha → input transaksi → lihat laporan.
