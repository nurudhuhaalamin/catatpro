# Arsitektur CatatPro

## Prinsip

1. **Buku besar = sumber kebenaran.** Setiap dokumen sumber (faktur jual, tagihan beli, kas,
   pergerakan stok) menghasilkan **satu jurnal berimbang** yang ditulis **atomik** ke
   `journals` + `journal_lines` dalam satu transaksi DB. Semua laporan diturunkan dari sini.
2. **Online-first.** Mutasi inti (posting) selalu ke server dalam transaksi. PWA meng-cache UI &
   data baca; input draft offline opsional dikirim saat online.
3. **Multi-tenant.** Semua tabel data ber-`org_id`, dilindungi **RLS Postgres** + cek membership
   di API (defense-in-depth).
4. **Dua mode UX.** *Sederhana* (bahasa awam → jurnal otomatis di belakang layar) & *Pro* (COA,
   jurnal manual, semua laporan).

## Lapisan

```
React PWA (apps/web)
   │  HTTPS + JWT Supabase (Authorization: Bearer)
   ▼
Hono API (apps/api) ── posting service (packages/shared) ── Drizzle
   │  transaksi atomik
   ▼
Supabase Postgres (skema + RLS di supabase/migrations)
```

- **`packages/shared`** memuat domain murni: skema Drizzle, tipe, zod, template COA, helper uang,
  dan **posting service** (`src/posting/`) — fungsi murni yang membangun jurnal berimbang
  (`assertBalanced`). Dipakai bersama API & web sehingga aturan akuntansi konsisten dan teruji.
- **`apps/api`** memverifikasi JWT (`src/auth.ts`), memuat membership (`src/middleware.ts`),
  dan menulis jurnal secara atomik (`src/routes/*`).
- **Koneksi DB**: gunakan pooler Supabase (Supavisor, port 6543, transaction mode) dengan
  `prepare: false` (lihat `apps/api/src/db.ts`).

## Keputusan kunci

| Topik | Keputusan | Alasan |
|---|---|---|
| Database | Supabase Postgres | ACID untuk double-entry, query laporan, RLS, `pg_cron` |
| Mode | Online-first + PWA | double-entry & stok sulit bebas-konflik offline |
| Tenancy | Multi-tenant SaaS | bisa dipakai banyak pelaku usaha |
| Akuntansi | Double-entry sejak awal | inti ERP; laporan akurat & dapat diaudit |
| Uang | integer *sen* (`bigint`) | hindari galat pembulatan float |
| Koreksi | jurnal pembalik | jurnal `posted` immutable, jejak audit terjaga |

## Keamanan

- JWT Supabase diverifikasi di API; setiap endpoint org memuat & memeriksa `memberships`
  (RBAC: `viewer < pencatat < admin < owner`).
- RLS Postgres (`supabase/migrations/0001_rls.sql`) mengisolasi tenant pada akses langsung.
