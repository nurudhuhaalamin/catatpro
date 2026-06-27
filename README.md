# CatatPro — ERP Keuangan Komprehensif

Aplikasi pencatatan keuangan setara **Accurate / Mekari Jurnal / Odoo** untuk pelaku usaha
Indonesia: **inventory, penjualan (AR), pembelian (AP), jurnal, buku besar, dan laporan keuangan**
berbasis **double-entry**. Dirancang agar **mudah dipakai yang belum paham akuntansi** (mode
sederhana → jurnal otomatis) namun **tetap lengkap bagi akuntan** (mode pro).

Penerus dari [`catat`](https://github.com/nurudhuhaalamin/catat): mengangkat pola yang terbukti
(monorepo, Drizzle, zod bersama, RBAC, uang dalam *sen*, soft-delete) di atas pondasi ERP yang lebih kuat.

## Tumpukan teknologi

| Lapisan | Teknologi |
|---|---|
| Frontend | React + Vite + TypeScript + Tailwind, **PWA** (online-first), TanStack Query |
| Backend/API | **Hono** di Node.js |
| Database | **Supabase Postgres** + **Drizzle ORM** |
| Auth | **Supabase Auth** (JWT) |
| Multi-tenant | `org_id` di semua tabel + **RLS Postgres** + cek membership di API |
| Akuntansi | **Double-entry**; buku besar (`journals` + `journal_lines`) = sumber kebenaran |
| Test | Vitest (invarian akuntansi) |
| CI/CD | GitHub Actions |

## Struktur proyek

```
apps/web/          React PWA
apps/api/          Hono (Node) — REST, posting service, reporting
packages/shared/   Drizzle schema, tipe, zod, COA, money, POSTING SERVICE (double-entry)
supabase/          migrations (skema + RLS)
docs/              ARCHITECTURE, ACCOUNTING (acuan standar 2026), ROADMAP
```

## Standar acuan (terbaru 2026)

Pembukuan mengacu standar terkini — lihat **[docs/ACCOUNTING.md](docs/ACCOUNTING.md)**:
- **SAK** (IAI/DSAK, kerangka KSPKI): **SAK EMKM** (default) & **SAK EP** (pengganti SAK ETAP, efektif 1 Jan 2025), konfigurabel per organisasi.
- **PPN**: tarif **12%** dengan **DPP Nilai Lain 11/12 → efektif 11%** (PMK 131/2024 & 11/2025), tersimpan sebagai data berlaku-per-tanggal (bukan hardcode).
- Siap **e-Faktur/Coretax**.

## Pengembangan lokal

Prasyarat: **Node 22+** dan **pnpm 10+** (`corepack enable`).

```bash
pnpm install
cp .env.example .env        # isi DATABASE_URL, SUPABASE_JWT_SECRET, VITE_SUPABASE_*

pnpm test                   # tes invarian akuntansi (packages/shared)
pnpm -r typecheck

pnpm db:generate            # generate migrasi Drizzle ke supabase/migrations
pnpm dev:api                # API di http://localhost:8787
pnpm dev:web                # Web di http://localhost:5173
```

## Status

- ✅ **Fase 0–1 (fondasi):** monorepo, skema akuntansi inti + RLS, template COA per standar,
  posting service double-entry + tes invarian, API (buat org & seed COA, jurnal manual, neraca saldo).
- ✅ **Fase 2 (Mitra & AR/AP):** kontak, faktur penjualan & tagihan pembelian (jurnal otomatis),
  pembayaran beralokasi multi-dokumen, laporan (Neraca, Laba-Rugi, Buku Besar, Aging), dan **web yang
  bisa dipakai end-to-end** (login Supabase, routing, konteks org).
- ✅ **Fase 3 (Inventory):** item/produk, gudang default, pergerakan stok, **valuasi rata-rata bergerak**
  + **HPP otomatis** terintegrasi ke penjualan/pembelian, laporan persediaan. **Skema diterapkan &
  diverifikasi di Supabase** (lihat **[docs/SUPABASE.md](docs/SUPABASE.md)**).

Lihat **[docs/ROADMAP.md](docs/ROADMAP.md)** untuk fase berikutnya (Pajak & tutup buku).
