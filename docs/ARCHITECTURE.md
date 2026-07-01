# Arsitektur CatatPro

## Prinsip

1. **Buku besar = sumber kebenaran.** Setiap dokumen sumber (faktur jual, tagihan beli, kas,
   pergerakan stok) menghasilkan **satu jurnal berimbang** yang ditulis **atomik** ke
   `journals` + `journal_lines` dalam satu transaksi. Semua laporan diturunkan dari sini.
2. **Online-first.** Mutasi inti (posting) selalu ke server dalam transaksi. PWA meng-cache UI &
   data baca; input draft offline opsional dikirim saat online.
3. **Multi-tenant via isolasi storage, bukan RLS.** Setiap organisasi punya **Durable Object
   SQLite miliknya sendiri** (`OrgDO`) — isolasi tenant penuh di level storage, bukan lewat baris
   dibedakan `org_id` + RLS seperti sebelumnya. Middleware API (`requireOrg`) tetap jadi gerbang
   otorisasi (cek membership) sebelum request menyentuh OrgDO manapun.
4. **Dua mode UX.** *Sederhana* (bahasa awam → jurnal otomatis di belakang layar) & *Pro* (COA,
   jurnal manual, semua laporan).

## Lapisan

```
React PWA (apps/web)
   │  HTTPS + JWT kustom (Authorization: Bearer)
   ▼
Hono API (apps/api) ── posting service (packages/shared, murni/tanpa I/O)
   │
   ├─ /api/auth/*, /api/orgs (GET/POST) ──▶ D1 "catatpro-control" (users, organizations, memberships)
   │
   └─ /api/orgs/:orgId/*  ──▶ Durable Object OrgDO (satu instance per organisasi, SQLite)
                                — semua data akuntansi (COA, jurnal, faktur, stok, aset, dst.)
```

- **`packages/shared`** memuat domain murni: skema Drizzle (`schema.control.ts` untuk D1,
  `schema.org.ts` untuk OrgDO), tipe, zod, template COA, helper uang, dan **posting service**
  (`src/posting/`) — fungsi murni yang membangun jurnal berimbang (`assertBalanced`), tidak
  berubah oleh migrasi ini karena sudah sepenuhnya DB-agnostic.
- **`apps/api`**:
  - `src/auth.ts` — hashing password (PBKDF2 via `crypto.subtle`) + JWT HS256 (`jose`).
  - `src/middleware.ts` — `requireAuth` (verifikasi JWT) & `requireOrg` (cek membership di D1,
    **satu-satunya gerbang otorisasi** sejak RLS Postgres dihapus).
  - `src/d1.ts` — klien Drizzle untuk D1 (control plane).
  - `src/durable-objects/org-do.ts` — class `OrgDO`: RPC method per operasi bisnis
    (`createSalesInvoice`, `createPurchaseBill`, dst.), delegasi ke `src/durable-objects/domain/*.ts`
    (logika per modul) & `src/durable-objects/lib/*.ts` (helper: sequences, stock, forex, period,
    accounting — port 1:1 dari `apps/api/src/lib/*.ts` versi Postgres lama, hanya berubah dari
    async/await ke panggilan sinkron `.all()/.get()/.run()` karena transaksi OrgDO memakai
    `DurableObjectStorage.transactionSync` yang sinkron).
  - `src/routes/*.ts` — dispatcher tipis: validasi zod + `requireAuth`/`requireOrg`, lalu
    memanggil D1 langsung (`orgs.ts`, `auth.ts`) atau RPC OrgDO (`getOrgStub(...)`) untuk
    sisanya.

## Kenapa Durable Objects (bukan D1 saja) untuk data akuntansi

Banyak alur (nomor urut dokumen, rata-rata biaya stok bergerak) adalah **baca-hitung-tulis**
yang harus atomik & bebas race-condition antar request bersamaan di org yang sama. D1 `batch()`
hanya menjalankan daftar statement yang SUDAH ditentukan (tanpa baca-lalu-cabang di tengah
transaksi) — tidak cocok untuk pola ini tanpa penulisan ulang besar-besaran + optimistic
concurrency. Durable Object ber-SQLite justru pas: satu instance memproses request untuk
storage-nya secara serial, dan `db.transaction()` (backed `storage.transactionSync`) memberi
transaksi sinkron dengan rollback penuh — nomor urut & rata-rata biaya aman dari race condition
tanpa locking manual. Ini juga pola yang direkomendasikan resmi Cloudflare untuk SaaS
multi-tenant ("per-entity storage").

## Trade-off yang disadari

- **Seeding org (COA/gudang/tarif pajak default) bukan satu transaksi native.** `POST /orgs`
  menulis `organizations`+`membership` ke D1, LALU memanggil `stub.seedOrg(...)` ke OrgDO —
  dua storage berbeda, tidak bisa satu transaksi. Self-healing: setiap RPC OrgDO yang butuh COA
  diawali guard `ensureSeeded()` yang men-seed mandiri bila belum (lihat `org-do.ts`).
- **Kolom `org_id` dipertahankan di tiap tabel OrgDO** walau teknisnya redundan (satu DO = satu
  org, isolasi sudah dijamin storage) — demi meminimalkan diff dari kode lama & sebagai
  defense-in-depth murah di level kolom.
- **Reset password via email tidak tersedia** (keputusan sadar agar tetap "hanya GitHub +
  Cloudflare", tanpa provider email pihak ketiga). Bisa ditambah nanti bila diperlukan.

## Keputusan kunci

| Topik | Keputusan | Alasan |
|---|---|---|
| Database (control plane) | Cloudflare D1 | users/organizations/memberships: low-write, tanpa invarian baca-cabang |
| Database (data plane) | Durable Object SQLite (1/org) | transaksi atomik+serial gratis untuk sequence & avg-cost, isolasi tenant penuh |
| Auth | JWT kustom (HS256) + PBKDF2 | tanpa dependensi eksternal (GitHub+Cloudflare saja) |
| Mode | Online-first + PWA | double-entry & stok sulit bebas-konflik offline |
| Tenancy | Multi-tenant, 1 OrgDO/organisasi | isolasi storage penuh, bukan RLS |
| Akuntansi | Double-entry sejak awal | inti ERP; laporan akurat & dapat diaudit |
| Uang | integer *sen* (`integer` SQLite) | hindari galat pembulatan float |
| Koreksi | jurnal pembalik | jurnal `posted` immutable, jejak audit terjaga |

## Keamanan

- JWT kustom diverifikasi di API (`requireAuth`); setiap endpoint org memuat & memeriksa
  `memberships` di D1 (`requireOrg`, RBAC: `viewer < pencatat < admin < owner`) — **satu-satunya**
  gerbang otorisasi (tidak ada RLS/defense-in-depth kedua lagi, sama seperti sebelumnya di mana
  RLS Postgres memang tidak menjadi andalan utama).
- OrgDO sendiri TIDAK melakukan cek auth/role — ia mempercayai Worker yang memanggilnya.
