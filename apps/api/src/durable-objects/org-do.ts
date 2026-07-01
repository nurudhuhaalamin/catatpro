import { DurableObject } from "cloudflare:workers";
import {
  warehouses,
  accounts,
  taxRates,
  coaTemplate,
  type AccountingStandard,
  type ContactCreate,
  type ItemCreate,
  type ExchangeRateCreate,
  type JournalCreate,
  type SalesInvoiceCreate,
  type PurchaseBillCreate,
  type PaymentCreate,
  type StockAdjustment,
  type AssetCreate,
  type DepreciateInput,
} from "@catatpro/shared";
import { orgSchema } from "@catatpro/shared";
import { createOrgDb, type OrgDb, type OrgDbTx } from "./db.js";
import { ORG_SCHEMA_STATEMENTS } from "./schema-ddl.js";
import { readOrgMeta, writeOrgMeta } from "./lib/org-meta.js";
import * as contactsDomain from "./domain/contacts.js";
import * as itemsDomain from "./domain/items.js";
import * as catalogDomain from "./domain/catalog.js";
import * as periodsDomain from "./domain/periods.js";
import * as journalsDomain from "./domain/journals.js";
import * as salesDomain from "./domain/sales.js";
import * as purchasesDomain from "./domain/purchases.js";
import * as paymentsDomain from "./domain/payments.js";
import * as inventoryDomain from "./domain/inventory.js";
import * as assetsDomain from "./domain/assets.js";
import * as reportsDomain from "./domain/reports.js";

export interface SeedOrgInput {
  accountingStandard: AccountingStandard;
  baseCurrency: string;
  npwp?: string | null;
}

/**
 * Satu OrgDO = SATU organisasi, storage SQLite terisolasi penuh (10GB,
 * ber-GA). Semua data akuntansi ber-org (lihat schema.org.ts) hidup di sini.
 * Worker resolve `env.ORG_DO.idFromName(orgId)` lalu memanggil method publik
 * di sini sebagai RPC (Workers RPC, bukan fetch()-over-JSON manual).
 *
 * DO ini TIDAK melakukan cek auth/role — itu tanggung jawab Worker
 * (requireAuth + requireOrg) sebelum stub dipanggil.
 */
export class OrgDO extends DurableObject {
  db: OrgDb;

  constructor(ctx: DurableObjectState, env: unknown) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    super(ctx, env as any);
    // Migrasi skema: idempoten (CREATE TABLE/INDEX IF NOT EXISTS), aman
    // dijalankan ulang tiap cold start. blockConcurrencyWhile memastikan
    // tak ada request diproses sebelum skema siap.
    ctx.blockConcurrencyWhile(async () => {
      for (const stmt of ORG_SCHEMA_STATEMENTS) {
        ctx.storage.sql.exec(stmt);
      }
    });
    this.db = createOrgDb(ctx.storage);
  }

  /* ------------------------------- seeding -------------------------------- */

  /**
   * Dipanggil oleh Worker sesaat setelah `organizations`+`memberships` dibuat
   * di D1 (lihat routes/orgs.ts). Idempoten — aman dipanggil ulang (mis. saat
   * retry setelah kegagalan jaringan). `orgId` disimpan di org_meta &
   * dipakai untuk mengisi kolom org_id semua baris yang di-seed di sini —
   * DO sendiri tidak bisa menurunkan orgId dari identitasnya (idFromName
   * satu arah), jadi Worker WAJIB mengirimkannya secara eksplisit di setiap
   * panggilan RPC (sama seperti pola `orgId` di durable-objects/lib/*.ts).
   */
  async seedOrg(orgId: string, input: SeedOrgInput): Promise<void> {
    this.db.transaction((tx) => {
      doSeed(tx, orgId, input);
    });
  }

  /**
   * Guard idempoten dipanggil di awal SETIAP RPC yang butuh COA/gudang
   * (createItem, createSalesInvoice, dst). Karena insert org+membership di D1
   * dan seedOrg() di OrgDO BUKAN satu transaksi native (dua storage
   * berbeda), request pertama yang menyentuh OrgDO sebelum seedOrg() sempat
   * jalan (mis. Worker crash di antara keduanya) akan men-trigger seed
   * mandiri di sini — self-healing tanpa retry queue. DO memproses request
   * secara serial per instance sehingga tidak pernah dobel-seed.
   */
  private ensureSeededTx(tx: OrgDbTx, orgId: string): void {
    if (readOrgMeta(tx, "seededAt")) return;
    doSeed(tx, orgId, {
      accountingStandard: (readOrgMeta(tx, "accountingStandard") as AccountingStandard) || "emkm",
      baseCurrency: readOrgMeta(tx, "baseCurrency") || "IDR",
    });
  }

  /** Dipakai internal oleh RPC lain (lihat durable-objects/lib/*). @internal */
  withSeededTx<T>(orgId: string, fn: (tx: OrgDbTx) => T): T {
    return this.db.transaction((tx) => {
      this.ensureSeededTx(tx, orgId);
      return fn(tx);
    });
  }

  /* ------------------------------- contacts -------------------------------- */

  async listContacts(orgId: string) {
    return this.withSeededTx(orgId, (tx) => contactsDomain.listContacts(tx, orgId));
  }
  async createContact(orgId: string, d: ContactCreate) {
    return this.withSeededTx(orgId, (tx) => contactsDomain.createContact(tx, orgId, d));
  }

  /* --------------------------------- items ---------------------------------- */

  async listItems(orgId: string) {
    return this.withSeededTx(orgId, (tx) => itemsDomain.listItems(tx, orgId));
  }
  async createItem(orgId: string, d: ItemCreate) {
    return this.withSeededTx(orgId, (tx) => itemsDomain.createItem(tx, orgId, d));
  }

  /* -------------------------------- catalog --------------------------------- */

  async listAccounts(orgId: string) {
    return this.withSeededTx(orgId, (tx) => catalogDomain.listAccounts(tx, orgId));
  }
  async listTaxRates(orgId: string) {
    return this.withSeededTx(orgId, (tx) => catalogDomain.listTaxRates(tx, orgId));
  }
  async listExchangeRates(orgId: string) {
    return this.withSeededTx(orgId, (tx) => catalogDomain.listExchangeRates(tx, orgId));
  }
  async addExchangeRate(orgId: string, d: ExchangeRateCreate) {
    return this.withSeededTx(orgId, (tx) => catalogDomain.addExchangeRate(tx, orgId, d));
  }

  /* --------------------------------- periods -------------------------------- */

  async listPeriods(orgId: string) {
    return this.withSeededTx(orgId, (tx) => periodsDomain.listPeriods(tx, orgId));
  }
  async createPeriod(orgId: string, d: periodsDomain.PeriodCreate) {
    return this.withSeededTx(orgId, (tx) => periodsDomain.createPeriod(tx, orgId, d));
  }
  async setPeriodStatus(orgId: string, periodId: string, status: "open" | "closed" | "locked") {
    return this.withSeededTx(orgId, (tx) => periodsDomain.setPeriodStatus(tx, orgId, periodId, status));
  }

  /* -------------------------------- journals -------------------------------- */

  async createManualJournal(orgId: string, d: JournalCreate, userId: string) {
    return this.withSeededTx(orgId, (tx) => journalsDomain.createManualJournal(tx, orgId, d, userId));
  }

  /* ---------------------------------- sales ---------------------------------- */

  async listSalesInvoices(orgId: string) {
    return this.withSeededTx(orgId, (tx) => salesDomain.listSalesInvoices(tx, orgId));
  }
  async createSalesInvoice(orgId: string, d: SalesInvoiceCreate, userId: string) {
    return this.withSeededTx(orgId, (tx) => salesDomain.createSalesInvoice(tx, orgId, d, userId));
  }

  /* -------------------------------- purchases -------------------------------- */

  async listPurchaseBills(orgId: string) {
    return this.withSeededTx(orgId, (tx) => purchasesDomain.listPurchaseBills(tx, orgId));
  }
  async createPurchaseBill(orgId: string, d: PurchaseBillCreate, userId: string) {
    return this.withSeededTx(orgId, (tx) => purchasesDomain.createPurchaseBill(tx, orgId, d, userId));
  }

  /* --------------------------------- payments --------------------------------- */

  async listPayments(orgId: string) {
    return this.withSeededTx(orgId, (tx) => paymentsDomain.listPayments(tx, orgId));
  }
  async createPayment(orgId: string, d: PaymentCreate, userId: string) {
    return this.withSeededTx(orgId, (tx) => paymentsDomain.createPayment(tx, orgId, d, userId));
  }

  /* -------------------------------- inventory -------------------------------- */

  async recordStockAdjustment(orgId: string, d: StockAdjustment, userId: string) {
    return this.withSeededTx(orgId, (tx) => inventoryDomain.recordStockAdjustment(tx, orgId, d, userId));
  }
  async stockValuation(orgId: string) {
    return this.withSeededTx(orgId, (tx) => inventoryDomain.stockValuation(tx, orgId));
  }
  async stockCard(orgId: string, itemId: string) {
    return this.withSeededTx(orgId, (tx) => inventoryDomain.stockCard(tx, orgId, itemId));
  }

  /* ---------------------------------- assets ---------------------------------- */

  async listAssets(orgId: string) {
    return this.withSeededTx(orgId, (tx) => assetsDomain.listAssets(tx, orgId));
  }
  async createAsset(orgId: string, d: AssetCreate) {
    return this.withSeededTx(orgId, (tx) => assetsDomain.createAsset(tx, orgId, d));
  }
  async depreciateAsset(orgId: string, assetId: string, d: DepreciateInput, userId: string) {
    return this.withSeededTx(orgId, (tx) => assetsDomain.depreciateAsset(tx, orgId, assetId, d, userId));
  }

  /* --------------------------------- reports ---------------------------------- */

  async trialBalance(orgId: string) {
    return this.withSeededTx(orgId, (tx) => reportsDomain.trialBalance(tx, orgId));
  }
  async incomeStatement(orgId: string) {
    return this.withSeededTx(orgId, (tx) => reportsDomain.incomeStatement(tx, orgId));
  }
  async balanceSheet(orgId: string) {
    return this.withSeededTx(orgId, (tx) => reportsDomain.balanceSheet(tx, orgId));
  }
  async ledger(orgId: string, accountId: string) {
    return this.withSeededTx(orgId, (tx) => reportsDomain.ledger(tx, orgId, accountId));
  }
  async arAging(orgId: string, asOf: string) {
    return this.withSeededTx(orgId, (tx) => reportsDomain.arAging(tx, orgId, asOf));
  }
  async apAging(orgId: string, asOf: string) {
    return this.withSeededTx(orgId, (tx) => reportsDomain.apAging(tx, orgId, asOf));
  }
  async taxSummary(orgId: string, from: string, to: string) {
    return this.withSeededTx(orgId, (tx) => reportsDomain.taxSummary(tx, orgId, from, to));
  }
  async cashFlow(orgId: string, from: string, to: string) {
    return this.withSeededTx(orgId, (tx) => reportsDomain.cashFlow(tx, orgId, from, to));
  }
  async efakturExport(orgId: string, from: string, to: string) {
    return this.withSeededTx(orgId, (tx) => reportsDomain.efakturExport(tx, orgId, from, to));
  }

  /* --------------------------- migrasi data (sementara) ---------------------------- */

  /**
   * MIGRASI-SAJA: tulis mentah data historis (dump JSON per tabel, urutan
   * aman-FK) hasil ekspor dari Supabase — TANPA menjalankan ulang logika
   * posting/sequence/avg-cost (data sudah valid secara historis, cukup
   * disalin apa adanya termasuk id/nomor/timestamp asli). TIDAK menjalankan
   * seed template COA — dump sudah membawa COA asli org tersebut.
   * Idempoten (menolak jalan dua kali via guard `dumpImportedAt`).
   * HAPUS method ini + route `routes/admin.ts` setelah migrasi selesai
   * diverifikasi (lihat scripts/migrate-from-supabase.ts).
   */
  async restoreFromDump(orgId: string, dump: Partial<Record<keyof typeof orgSchema, unknown[]>>): Promise<{ inserted: Record<string, number> }> {
    return this.db.transaction((tx) => {
      if (readOrgMeta(tx, "dumpImportedAt")) throw new Error("Dump sudah pernah diimpor untuk org ini");
      const inserted: Record<string, number> = {};
      for (const tableName of RESTORE_ORDER) {
        const rows = dump[tableName];
        if (!rows || rows.length === 0) continue;
        const table = orgSchema[tableName] as (typeof orgSchema)[keyof typeof orgSchema];
        for (const row of rows) {
          const r = row as { orgId?: string };
          if (r.orgId !== undefined && r.orgId !== orgId) {
            throw new Error(`Baris ${tableName} punya org_id (${r.orgId}) ≠ orgId tujuan (${orgId})`);
          }
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          tx.insert(table as any).values(row as any).run();
        }
        inserted[tableName] = rows.length;
      }
      writeOrgMeta(tx, "seededAt", new Date().toISOString()); // dump sudah membawa COA sendiri
      writeOrgMeta(tx, "dumpImportedAt", new Date().toISOString());
      return { inserted };
    });
  }
}

// Urutan restore aman-FK (induk sebelum anak).
const RESTORE_ORDER: (keyof typeof orgSchema)[] = [
  "accountingPeriods",
  "accounts",
  "numberSequences",
  "taxRates",
  "warehouses",
  "contacts",
  "items",
  "exchangeRates",
  "journals",
  "journalLines",
  "salesInvoices",
  "salesInvoiceLines",
  "purchaseBills",
  "purchaseBillLines",
  "payments",
  "paymentAllocations",
  "stockMoves",
  "fixedAssets",
  "depreciationEntries",
];

function doSeed(tx: OrgDbTx, orgId: string, input: SeedOrgInput): void {
  if (readOrgMeta(tx, "seededAt")) return; // idempoten
  writeOrgMeta(tx, "orgId", orgId);
  writeOrgMeta(tx, "accountingStandard", input.accountingStandard);
  writeOrgMeta(tx, "baseCurrency", input.baseCurrency);
  if (input.npwp) writeOrgMeta(tx, "npwp", input.npwp);

  tx.insert(warehouses).values({ orgId, name: "Gudang Utama", isDefault: true }).run();

  const coaRows = coaTemplate(input.accountingStandard).map((a) => ({
    orgId,
    code: a.code,
    name: a.name,
    type: a.type,
    subtype: a.subtype,
    normalBalance: a.normalBalance,
  }));
  // SQLite (DO) membatasi jumlah parameter terikat per statement — masukkan
  // satu baris per statement (aman untuk template COA sebesar apa pun, mis.
  // standar EP; jumlah baris kecil <100 jadi tak masalah performa).
  const insertedAccounts = coaRows.map((row) => tx.insert(accounts).values(row).returning().get());

  const taxOutput = insertedAccounts.find((a) => a.subtype === "tax_output");
  tx.insert(taxRates)
    .values({
      orgId,
      name: "PPN 12% (DPP 11/12)",
      appliesTo: "both",
      rateBps: 1200,
      dppFactorNum: 11,
      dppFactorDen: 12,
      accountId: taxOutput?.id ?? null,
      validFrom: "2025-01-01",
    })
    .run();

  writeOrgMeta(tx, "seededAt", new Date().toISOString());
}
