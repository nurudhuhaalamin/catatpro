# Model Akuntansi & Acuan Standar (terbaru 2026)

## 1. Model double-entry

- **`journals`** (header): `number`, `date`, `period_id`, `source_type`, `source_id`, `status`
  (`draft|posted|void`), `memo`, `client_id` (idempotensi), `reversed_by_journal_id`.
- **`journal_lines`** (detail): `account_id`, `debit_cents`, `credit_cents`, `contact_id`, `line_no`.
  - **Invarian DB**: `CHECK` memastikan satu baris hanya debit **atau** kredit, keduanya ≥ 0.
  - **Invarian posting**: `assertBalanced` di `packages/shared/src/posting/` memastikan
    Σdebit = Σkredit > 0 sebelum ditulis.
- **Immutability**: jurnal `posted` tidak diedit; koreksi memakai **jurnal pembalik**
  (`buildReversalJournal`) untuk menjaga jejak audit.

## 2. Mapping jurnal otomatis (posting service)

| Dokumen | Jurnal |
|---|---|
| Kas masuk | Dr Kas / Cr akun lawan |
| Kas keluar | Dr akun lawan / Cr Kas |
| Transfer | Dr Kas tujuan / Cr Kas asal |
| Faktur penjualan | Dr Piutang / Cr Pendapatan / Cr PPN Keluaran; (HPP) Dr HPP / Cr Persediaan |
| Tagihan pembelian | Dr Persediaan/Beban + Dr PPN Masukan / Cr Utang Usaha |
| Pelunasan piutang | Dr Kas / Cr Piutang |
| Pelunasan utang | Dr Utang / Cr Kas |

Akun diresolusi lewat **subtype semantik** (`accounts_receivable`, `revenue`, `tax_output`, …)
via `makeAccountResolver`, sehingga independen dari nomor akun.

## 3. Chart of Accounts (COA) per standar

Template di `packages/shared/src/coa.ts`, dipilih saat membuat organisasi
(`organizations.accounting_standard`):

- **SAK EMKM** (default) — paling ringkas.
- **SAK EP / SAK** — memperluas EMKM (biaya dibayar dimuka, aset tetap & akumulasi penyusutan,
  utang bank, beban bunga, dst).

## 4. Acuan standar — TERBARU (diverifikasi Juni 2026)

### Standar akuntansi (IAI/DSAK, kerangka KSPKI — buku "SAK Indonesia Efektif 2025")
- **SAK EMKM** — entitas mikro/kecil tanpa akuntabilitas publik; basis **biaya historis**; laporan
  minimal: **Neraca, Laba Rugi, CALK**.
- **SAK EP (Entitas Privat)** — **menggantikan SAK ETAP**, efektif **1 Januari 2025**; set laporan
  lebih lengkap (+ Perubahan Ekuitas, Arus Kas).
- **SAK** (IFRS-converged) — entitas dengan akuntabilitas publik (roadmap lanjut).

> Mesin ledger **netral-standar**; perbedaan tier hanya di **template COA, format laporan, dan
> kebijakan pengukuran** — bukan di engine double-entry.

### Perpajakan (2025–2026)
- **PPN**: tarif **12%** (UU HPP), namun **DPP Nilai Lain = 11/12** untuk BKP/JKP non-mewah →
  **tarif efektif 11%** (PMK 131/2024 & **PMK 11/2025**). Diimplementasikan di tabel `tax_rates`
  (`rate_bps`, `dpp_factor_num/den`, `valid_from`) dan helper `computeTax` — **berlaku-per-tanggal,
  bukan hardcode**, sehingga tahan perubahan tarif.
- **Coretax / e-Faktur**: Coretax menggantikan e-Faktur legacy (penuh akhir 2025). Skema faktur
  (fase AR/AP) akan menyimpan field e-Faktur/Coretax (NPWP/NIK, kode transaksi, DPP, DPP nilai
  lain, PPN) untuk ekspor/integrasi.
- **Tenggat (2026)**: pembuatan/pelaporan e-Faktur s/d **tanggal 20** bulan berikutnya; SPT PPN
  akhir bulan berikutnya — dipakai untuk pengingat & laporan pajak.

### Sumber
- SAK Indonesia Efektif 1 Jan 2025 — IAI: https://web.iaiglobal.or.id/Berita-IAI/detail/standar_akuntansi_keuangan_indonesia_efektif_per_1_januari_2025
- Kerangka Standar Pelaporan Keuangan Indonesia (KSPKI) — IAI: https://web.iaiglobal.or.id/SAK-IAI/Kerangka%20Standar%20Pelaporan%20Keuangan%C2%A0Indonesia
- Tentang SAK EMKM — IAI: https://web.iaiglobal.or.id/SAK-IAI/Tentang%20SAK%20EMKM
- PMK 11/2025 (DPP Nilai Lain & Besaran Tertentu PPN): https://jdih.kemenkeu.go.id/api/download/52955502-8733-4fdd-98ce-bb03c31cda0b/2025pmkeuangan11.pdf
- DJP — Aturan DPP Nilai Lain & Besaran Tertentu PPN: https://www.pajak.go.id/en/node/114038
- Update CoreTax & deadline e-Faktur 2026: https://blog.alatpajak.id/blog/deadline-efaktur-diperpanjang-2026
