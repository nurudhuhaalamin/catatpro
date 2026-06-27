# Setup & Verifikasi Supabase

Project Supabase **`catatpro`** sudah disiapkan & diverifikasi.

| Item | Nilai |
|---|---|
| Project ref | `zigdheousrbhxoivksgm` |
| Region | `ap-southeast-1` |
| API URL | `https://zigdheousrbhxoivksgm.supabase.co` |
| Publishable key | `sb_publishable_4qnmFcyEavki_ld-AA_9mg_HBROyYzl` |

> URL & publishable/anon key **aman dipublikasikan** (akses tetap dibatasi RLS). **JWT secret** &
> **password database** **rahasia** — ambil dari Dashboard, jangan commit.

## Status migrasi (sudah diterapkan via MCP)

Skema lengkap Fase 0–3 sudah diterapkan ke project (18 tabel, **RLS aktif di semua tabel**):
akuntansi inti, AR/AP, inventory, + kebijakan RLS (`is_org_member`). Diverifikasi:
- `list_tables` → 18 tabel, `rls_enabled = true` semua.
- Smoke test double-entry di DB nyata: beli 10@Rp1.000 → jual 4@Rp1.500 → **neraca saldo seimbang**
  (debit = kredit = Rp20.000), **Persediaan akhir = Rp6.000** (6 unit × Rp1.000, rata-rata bergerak).
- `get_advisors(security)`: hanya WARN wajar untuk fungsi `SECURITY DEFINER` RLS (sengaja;
  `search_path` dikunci; EXECUTE dicabut dari `anon`).

## Menjalankan aplikasi terhubung ke Supabase

1. Isi `.env` (lihat `.env.example`):
   - `VITE_SUPABASE_URL` & `VITE_SUPABASE_ANON_KEY` → nilai di tabel atas.
   - `SUPABASE_JWT_SECRET` → Dashboard ▸ Project Settings ▸ API ▸ **JWT secret**.
   - `DATABASE_URL` → Dashboard ▸ Connect ▸ **Connection pooling** (Transaction, port 6543),
     sertakan password DB. Contoh:
     `postgres://postgres.zigdheousrbhxoivksgm:<PASSWORD>@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres`
2. Aktifkan **Email auth** di Dashboard ▸ Authentication ▸ Providers (untuk login/daftar).
3. Jalankan:
   ```bash
   pnpm dev:api    # http://localhost:8787
   pnpm dev:web    # http://localhost:5173
   ```
4. Daftar akun → buat usaha (COA & PPN ter-seed) → input kontak, item, penjualan/pembelian,
   pembayaran → lihat laporan.

> Migrasi berikutnya: `pnpm db:generate` lalu terapkan file baru di `supabase/migrations/`
> (via Supabase CLI `supabase db push`, atau apply manual). Awalan `rls_*` selalu diterapkan terakhir.
