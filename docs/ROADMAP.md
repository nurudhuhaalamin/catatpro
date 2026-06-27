# Roadmap CatatPro

Dikerjakan bertahap; tiap fase idealnya satu PR.

## ✅ Fase 0 — Fondasi
- Monorepo pnpm (web, api, shared, supabase).
- Skema akuntansi inti (Postgres/Drizzle): `organizations`, `memberships`, `accounting_periods`,
  `accounts` (COA), `number_sequences`, `tax_rates`, `journals`, `journal_lines`.
- RLS multi-tenant + helper `is_org_member`.
- Template COA per standar (EMKM/EP) + seed tarif PPN 2026.
- Supabase Auth (verifikasi JWT) + RBAC.

## ✅ Fase 1 — Inti akuntansi
- Posting service double-entry + tes invarian (balance, neraca saldo = 0).
- API: buat organisasi (seed COA & PPN), jurnal manual, neraca saldo.
- PWA skeleton.

## ✅ Fase 2 — Mitra & AR/AP
- Kontak (customer/vendor).
- Penjualan: faktur multi-baris → piutang, jurnal otomatis (AR/Revenue/PPN keluaran).
- Pembelian: tagihan multi-baris → hutang, jurnal otomatis (AP/Inventory|Expense/PPN masukan).
- Pembayaran **beralokasi multi-dokumen** (receive/pay) + jurnal pelunasan.
- Penomoran dokumen atomik (`number_sequences`).
- Laporan: Neraca Saldo, Neraca, Laba Rugi, Buku Besar, Aging AR/AP.
- Web: login Supabase, routing, konteks org, halaman Kontak/Penjualan/Pembelian/Pembayaran/Laporan.

## ✅ Fase 3 — Inventory
- Item (stok/jasa), gudang default, pergerakan stok, penyesuaian/stok awal.
- Valuasi **rata-rata bergerak** + integrasi **HPP otomatis** ke penjualan & biaya rata-rata ke pembelian.
- Laporan persediaan (valuasi) + kartu stok.
- Diterapkan & diverifikasi di Supabase (lihat docs/SUPABASE.md).

## ✅ Fase 4 — Pajak & tutup buku
- **Tutup/kunci periode** (`accounting_periods` + guard `assertPeriodOpen` di semua jalur posting).
- **Laporan PPN** (keluaran − masukan = terutang) + field e-Faktur (`tax_code`, `counterparty_npwp`)
  & **ekspor e-Faktur CSV**.
- **Laporan Arus Kas** (metode langsung; operasional/investasi/pendanaan).
- **Ekspor CSV** semua laporan + **tampilan cetak** (print-to-PDF). Halaman kelola Periode.
- Diverifikasi di Supabase (PPN & arus kas).

## Fase 5 — Lanjutan (bertahap)
- ✅ **Aset tetap & penyusutan** (garis lurus): daftar aset, jalankan penyusutan →
  jurnal Dr Beban Penyusutan / Cr Akumulasi Penyusutan; nilai buku & laporan. Diverifikasi di Supabase.
- ✅ **Multi-currency** (penuh + selisih kurs): tabel kurs, dokumen simpan mata uang & kurs,
  buku besar tetap mata uang dasar, **laba/rugi selisih kurs** otomatis saat pelunasan. Diverifikasi di Supabase.
- ⏭️ Faktur berulang + pengingat jatuh tempo (butuh kanal notifikasi/`pg_cron`), rekonsiliasi bank
  (butuh format impor), anggaran, dashboard lanjutan.
- ❌ Importer dari `catat` — **dibatalkan** (CatatPro produk 100% baru).
