# Deploy CatatPro ke Cloudflare (Workers + Static Assets)

Satu **Cloudflare Worker** melayani **SPA** (aset statis dari `apps/web/dist`) sekaligus **API**
(`/api/*`). Database tetap **Supabase Postgres**, diakses dari Worker.

## Arsitektur runtime

```
Browser ─▶ Worker catatpro
            ├─ /api/*  → Hono (apps/api/src/worker.ts → app.ts)
            └─ lainnya → ASSETS (apps/web/dist, fallback index.html)
                         │
                         └─ Postgres Supabase (via Hyperdrive atau DATABASE_URL secret)
```

## Prasyarat (sekali set)

1. **Akun Cloudflare** + Wrangler login lokal (`npx wrangler login`) atau API token untuk CI.
2. **Koneksi DB Supabase** — pakai connection string **Session/Transaction Pooler** (Dashboard ▸
   Connect ▸ Connection pooling), berisi password DB:
   `postgres://postgres.zigdheousrbhxoivksgm:<PASSWORD>@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres`

### Database — pilih salah satu

**(A) Hyperdrive — rekomendasi** (pooling + sembunyikan connstr):
```bash
npx wrangler hyperdrive create catatpro-db --connection-string="postgres://postgres.zigdheousrbhxoivksgm:<PASSWORD>@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres"
```
Salin `id` yang muncul ke blok `[[hyperdrive]]` di `wrangler.toml` (hapus komentar).

**(B) DATABASE_URL secret — cepat**:
```bash
npx wrangler secret put DATABASE_URL   # tempel connection string pooler
```

### Secret wajib (selalu)
```bash
npx wrangler secret put SUPABASE_JWT_SECRET   # Dashboard Supabase ▸ Settings ▸ API ▸ JWT secret
```

## Deploy manual (lokal)
```bash
pnpm install
pnpm cf:deploy        # build web + wrangler deploy
```
Worker live di `https://catatpro.<subdomain>.workers.dev`. Set `WEB_ORIGIN` di `wrangler.toml`
ke URL itu (untuk CORS, walau same-origin), lalu deploy ulang.

## Deploy otomatis (GitHub Actions)

Workflow `.github/workflows/deploy.yml` deploy tiap push ke `main`. Tambah di repo:
- **Secrets**: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` (+ jika pakai jalur B & ingin CI set
  secret, kelola via `wrangler secret`).
- **Variables**: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (untuk build web).

> Secret `SUPABASE_JWT_SECRET` & DB (Hyperdrive/DATABASE_URL) di-set sekali via `wrangler` (bukan di
> CI), tersimpan di Worker.

## Auth Supabase

Aktifkan **Email** provider di Dashboard Supabase ▸ Authentication ▸ Providers. Tambahkan URL Worker
ke **Redirect URLs** bila memakai OAuth/email confirm.

## Verifikasi pasca-deploy

- `GET https://catatpro.<subdomain>.workers.dev/api/health` → `{ ok: true }`.
- Buka root → daftar/login → buat usaha → input transaksi → lihat laporan.
