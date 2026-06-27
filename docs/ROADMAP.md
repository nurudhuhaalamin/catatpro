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

## ⏭️ Fase 2 — Mitra & AR/AP
- Kontak (customer/vendor).
- Penjualan: faktur → penerimaan, piutang, aging (jurnal otomatis).
- Pembelian: tagihan → pembayaran, hutang, aging.
- Laporan: Neraca, Laba Rugi, Buku Besar (UI), aging.

## ⏭️ Fase 3 — Inventory
- Item, gudang, pergerakan stok, opname.
- Valuasi (average/FIFO) + integrasi HPP ke penjualan/pembelian.

## ⏭️ Fase 4 — Pajak & tutup buku
- PPN masukan/keluaran (tarif via `tax_rates`), field & ekspor e-Faktur/Coretax.
- Tutup/kunci periode; Arus Kas; ekspor PDF/CSV/Excel.

## ⏭️ Fase 5 — Lanjutan
- Multi-currency, faktur berulang & pengingat jatuh tempo, rekonsiliasi bank,
  aset tetap & penyusutan, anggaran, dashboard, (opsional) importer data dari `catat`.
