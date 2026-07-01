import { sql } from "drizzle-orm";
import { sqliteTable, text, integer, index, uniqueIndex, check } from "drizzle-orm/sqlite-core";

/* -------------------------------------------------------------------------- */
/*  CatatPro — skema data plane (satu SQLite per organisasi, via Durable      */
/*  Object "OrgDO"). Setiap org punya storage TERISOLASI penuh (satu DO       */
/*  instance = satu org) — org_id tetap dipertahankan di tiap tabel (NOT      */
/*  NULL, tanpa FK ke organizations — tabel itu kini di D1/control plane)     */
/*  sebagai defense-in-depth murah & agar semua query WHERE org_id = ...      */
/*  yang sudah ada tetap identik, walau teknisnya redundan dengan isolasi     */
/*  per-DO.                                                                    */
/*                                                                            */
/*  Buku besar (journals + journal_lines) adalah SUMBER KEBENARAN. Semua      */
/*  laporan diturunkan darinya. Uang disimpan sebagai integer "sen".          */
/* -------------------------------------------------------------------------- */

const uuidPk = () =>
  text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());

const nowMs = () =>
  integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date());

const updatedAtMs = () =>
  integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date());

/* -------------------------------- periods --------------------------------- */

export const accountingPeriods = sqliteTable(
  "accounting_periods",
  {
    id: uuidPk(),
    orgId: text("org_id").notNull(),
    name: text("name").notNull(), // mis. "2026-01"
    startDate: text("start_date").notNull(),
    endDate: text("end_date").notNull(),
    status: text("status", { enum: ["open", "closed", "locked"] }).notNull().default("open"),
    createdAt: nowMs(),
    updatedAt: updatedAtMs(),
  },
  (t) => ({
    orgIdx: index("periods_org_idx").on(t.orgId),
    uniqName: uniqueIndex("periods_org_name_uniq").on(t.orgId, t.name),
    statusChk: check("periods_status_chk", sql`${t.status} IN ('open','closed','locked')`),
  }),
);

/* ----------------------------- chart of accounts -------------------------- */

export const accounts = sqliteTable(
  "accounts",
  {
    id: uuidPk(),
    orgId: text("org_id").notNull(),
    code: text("code").notNull(), // mis. "1-10001"
    name: text("name").notNull(),
    type: text("type", { enum: ["asset", "liability", "equity", "income", "expense"] }).notNull(),
    // subtype semantik untuk posting otomatis & pemetaan laporan
    // mis. cash_bank, accounts_receivable, inventory, accounts_payable,
    //      tax_output, tax_input, revenue, cogs, expense, equity, retained_earnings
    subtype: text("subtype"),
    normalBalance: text("normal_balance", { enum: ["debit", "credit"] }).notNull(),
    parentId: text("parent_id"),
    isPostable: integer("is_postable", { mode: "boolean" }).notNull().default(true),
    isArchived: integer("is_archived", { mode: "boolean" }).notNull().default(false),
    createdAt: nowMs(),
    updatedAt: updatedAtMs(),
    deletedAt: integer("deleted_at", { mode: "timestamp_ms" }),
  },
  (t) => ({
    orgIdx: index("accounts_org_idx").on(t.orgId),
    uniqCode: uniqueIndex("accounts_org_code_uniq").on(t.orgId, t.code),
    typeChk: check(
      "accounts_type_chk",
      sql`${t.type} IN ('asset','liability','equity','income','expense')`,
    ),
    normalBalanceChk: check(
      "accounts_normal_balance_chk",
      sql`${t.normalBalance} IN ('debit','credit')`,
    ),
  }),
);

/* --------------------------- document numbering --------------------------- */

export const numberSequences = sqliteTable(
  "number_sequences",
  {
    id: uuidPk(),
    orgId: text("org_id").notNull(),
    docType: text("doc_type").notNull(), // journal | sales_invoice | purchase_bill | payment | ...
    prefix: text("prefix").notNull().default(""),
    period: text("period").notNull().default(""), // "" = berkelanjutan; "2026" / "2026-01" = per periode
    nextValue: integer("next_value", { mode: "number" }).notNull().default(1),
    padding: integer("padding").notNull().default(4),
    updatedAt: updatedAtMs(),
  },
  (t) => ({
    uniqSeq: uniqueIndex("number_sequences_uniq").on(t.orgId, t.docType, t.period),
  }),
);

/* -------------------------------- tax rates ------------------------------- */

export const taxRates = sqliteTable(
  "tax_rates",
  {
    id: uuidPk(),
    orgId: text("org_id").notNull(),
    name: text("name").notNull(), // mis. "PPN 12% (DPP 11/12)"
    appliesTo: text("applies_to", { enum: ["sales", "purchase", "both"] }).notNull().default("both"),
    // Tarif dalam basis points (1200 = 12%).
    rateBps: integer("rate_bps").notNull(),
    // DPP Nilai Lain (PMK 131/2024 & 11/2025): tarif efektif = rate * num/den.
    dppFactorNum: integer("dpp_factor_num").notNull().default(1),
    dppFactorDen: integer("dpp_factor_den").notNull().default(1),
    accountId: text("account_id").references(() => accounts.id),
    validFrom: text("valid_from").notNull(),
    validTo: text("valid_to"),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    createdAt: nowMs(),
    updatedAt: updatedAtMs(),
  },
  (t) => ({
    orgIdx: index("tax_rates_org_idx").on(t.orgId),
    appliesChk: check("tax_rates_applies_chk", sql`${t.appliesTo} IN ('sales','purchase','both')`),
  }),
);

/* --------------------------------- ledger -------------------------------- */

export const journals = sqliteTable(
  "journals",
  {
    id: uuidPk(),
    orgId: text("org_id").notNull(),
    number: text("number"),
    date: text("date").notNull(),
    periodId: text("period_id").references(() => accountingPeriods.id),
    // dokumen sumber yang memicu jurnal ini (manual bila jurnal umum)
    sourceType: text("source_type").notNull().default("manual"),
    sourceId: text("source_id"),
    status: text("status", { enum: ["draft", "posted", "void"] }).notNull().default("posted"),
    memo: text("memo"),
    createdBy: text("created_by"),
    // idempotensi: jurnal yang sama dari klien tidak diposting dua kali
    clientId: text("client_id"),
    // koreksi via pembalik, bukan edit
    reversedByJournalId: text("reversed_by_journal_id"),
    createdAt: nowMs(),
    updatedAt: updatedAtMs(),
    postedAt: integer("posted_at", { mode: "timestamp_ms" }),
  },
  (t) => ({
    orgDateIdx: index("journals_org_date_idx").on(t.orgId, t.date),
    sourceIdx: index("journals_source_idx").on(t.orgId, t.sourceType, t.sourceId),
    clientUniq: uniqueIndex("journals_client_uniq").on(t.orgId, t.clientId),
    statusChk: check("journals_status_chk", sql`${t.status} IN ('draft','posted','void')`),
  }),
);

export const journalLines = sqliteTable(
  "journal_lines",
  {
    id: uuidPk(),
    orgId: text("org_id").notNull(),
    journalId: text("journal_id")
      .notNull()
      .references(() => journals.id, { onDelete: "cascade" }),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id),
    debitCents: integer("debit_cents", { mode: "number" }).notNull().default(0),
    creditCents: integer("credit_cents", { mode: "number" }).notNull().default(0),
    contactId: text("contact_id"),
    memo: text("memo"),
    lineNo: integer("line_no").notNull().default(0),
  },
  (t) => ({
    orgAccountIdx: index("journal_lines_org_account_idx").on(t.orgId, t.accountId),
    journalIdx: index("journal_lines_journal_idx").on(t.journalId),
    // Satu baris hanya boleh debit ATAU kredit, keduanya non-negatif.
    debitCreditChk: check(
      "journal_lines_debit_credit_chk",
      sql`${t.debitCents} >= 0 AND ${t.creditCents} >= 0 AND NOT (${t.debitCents} > 0 AND ${t.creditCents} > 0)`,
    ),
  }),
);

/* ----------------------------- contacts (mitra) -------------------------- */

export const contacts = sqliteTable(
  "contacts",
  {
    id: uuidPk(),
    orgId: text("org_id").notNull(),
    name: text("name").notNull(),
    type: text("type", { enum: ["customer", "supplier", "both"] }).notNull().default("both"),
    email: text("email"),
    phone: text("phone"),
    npwp: text("npwp"),
    address: text("address"),
    note: text("note"),
    createdAt: nowMs(),
    updatedAt: updatedAtMs(),
    deletedAt: integer("deleted_at", { mode: "timestamp_ms" }),
  },
  (t) => ({
    orgIdx: index("contacts_org_idx").on(t.orgId),
    typeChk: check("contacts_type_chk", sql`${t.type} IN ('customer','supplier','both')`),
  }),
);

/* ------------------------------- sales (AR) ------------------------------ */

export const salesInvoices = sqliteTable(
  "sales_invoices",
  {
    id: uuidPk(),
    orgId: text("org_id").notNull(),
    number: text("number"),
    contactId: text("contact_id")
      .notNull()
      .references(() => contacts.id),
    date: text("date").notNull(),
    dueDate: text("due_date"),
    status: text("status", { enum: ["draft", "posted", "partial", "paid", "void"] })
      .notNull()
      .default("posted"),
    subtotalCents: integer("subtotal_cents", { mode: "number" }).notNull().default(0),
    taxCents: integer("tax_cents", { mode: "number" }).notNull().default(0),
    totalCents: integer("total_cents", { mode: "number" }).notNull().default(0),
    paidCents: integer("paid_cents", { mode: "number" }).notNull().default(0),
    taxRateId: text("tax_rate_id").references(() => taxRates.id),
    // Multi-currency: mata uang dokumen & kurs (base per 1 unit asing, skala 1e6).
    // Nilai *_cents pada dokumen = mata uang DOKUMEN; buku besar selalu mata uang dasar.
    currency: text("currency").notNull().default("IDR"),
    rateMicros: integer("rate_micros", { mode: "number" }).notNull().default(1_000_000),
    // e-Faktur/Coretax: kode transaksi (mis. '01','04') & NPWP/NIK lawan (snapshot).
    taxCode: text("tax_code"),
    counterpartyNpwp: text("counterparty_npwp"),
    journalId: text("journal_id").references(() => journals.id),
    memo: text("memo"),
    createdBy: text("created_by"),
    clientId: text("client_id"),
    createdAt: nowMs(),
    updatedAt: updatedAtMs(),
    deletedAt: integer("deleted_at", { mode: "timestamp_ms" }),
  },
  (t) => ({
    orgIdx: index("sales_invoices_org_idx").on(t.orgId, t.date),
    contactIdx: index("sales_invoices_contact_idx").on(t.orgId, t.contactId),
    clientUniq: uniqueIndex("sales_invoices_client_uniq").on(t.orgId, t.clientId),
    statusChk: check(
      "sales_invoices_status_chk",
      sql`${t.status} IN ('draft','posted','partial','paid','void')`,
    ),
  }),
);

export const salesInvoiceLines = sqliteTable(
  "sales_invoice_lines",
  {
    id: uuidPk(),
    orgId: text("org_id").notNull(),
    invoiceId: text("invoice_id")
      .notNull()
      .references(() => salesInvoices.id, { onDelete: "cascade" }),
    lineNo: integer("line_no").notNull().default(0),
    description: text("description").notNull(),
    qty: integer("qty").notNull().default(1),
    unitPriceCents: integer("unit_price_cents", { mode: "number" }).notNull().default(0),
    amountCents: integer("amount_cents", { mode: "number" }).notNull().default(0),
    revenueAccountId: text("revenue_account_id")
      .notNull()
      .references(() => accounts.id),
  },
  (t) => ({ invoiceIdx: index("sales_invoice_lines_invoice_idx").on(t.invoiceId) }),
);

/* ----------------------------- purchases (AP) ---------------------------- */

export const purchaseBills = sqliteTable(
  "purchase_bills",
  {
    id: uuidPk(),
    orgId: text("org_id").notNull(),
    number: text("number"),
    contactId: text("contact_id")
      .notNull()
      .references(() => contacts.id),
    date: text("date").notNull(),
    dueDate: text("due_date"),
    status: text("status", { enum: ["draft", "posted", "partial", "paid", "void"] })
      .notNull()
      .default("posted"),
    subtotalCents: integer("subtotal_cents", { mode: "number" }).notNull().default(0),
    taxCents: integer("tax_cents", { mode: "number" }).notNull().default(0),
    totalCents: integer("total_cents", { mode: "number" }).notNull().default(0),
    paidCents: integer("paid_cents", { mode: "number" }).notNull().default(0),
    taxRateId: text("tax_rate_id").references(() => taxRates.id),
    currency: text("currency").notNull().default("IDR"),
    rateMicros: integer("rate_micros", { mode: "number" }).notNull().default(1_000_000),
    taxCode: text("tax_code"),
    counterpartyNpwp: text("counterparty_npwp"),
    journalId: text("journal_id").references(() => journals.id),
    memo: text("memo"),
    createdBy: text("created_by"),
    clientId: text("client_id"),
    createdAt: nowMs(),
    updatedAt: updatedAtMs(),
    deletedAt: integer("deleted_at", { mode: "timestamp_ms" }),
  },
  (t) => ({
    orgIdx: index("purchase_bills_org_idx").on(t.orgId, t.date),
    contactIdx: index("purchase_bills_contact_idx").on(t.orgId, t.contactId),
    clientUniq: uniqueIndex("purchase_bills_client_uniq").on(t.orgId, t.clientId),
    statusChk: check(
      "purchase_bills_status_chk",
      sql`${t.status} IN ('draft','posted','partial','paid','void')`,
    ),
  }),
);

export const purchaseBillLines = sqliteTable(
  "purchase_bill_lines",
  {
    id: uuidPk(),
    orgId: text("org_id").notNull(),
    billId: text("bill_id")
      .notNull()
      .references(() => purchaseBills.id, { onDelete: "cascade" }),
    lineNo: integer("line_no").notNull().default(0),
    description: text("description").notNull(),
    qty: integer("qty").notNull().default(1),
    unitPriceCents: integer("unit_price_cents", { mode: "number" }).notNull().default(0),
    amountCents: integer("amount_cents", { mode: "number" }).notNull().default(0),
    // akun debet: persediaan (inventory) atau beban (expense)
    debitAccountId: text("debit_account_id")
      .notNull()
      .references(() => accounts.id),
  },
  (t) => ({ billIdx: index("purchase_bill_lines_bill_idx").on(t.billId) }),
);

/* ------------------------------- payments -------------------------------- */

export const payments = sqliteTable(
  "payments",
  {
    id: uuidPk(),
    orgId: text("org_id").notNull(),
    number: text("number"),
    contactId: text("contact_id")
      .notNull()
      .references(() => contacts.id),
    direction: text("direction", { enum: ["receive", "pay"] }).notNull(),
    date: text("date").notNull(),
    // akun kas/bank (akun COA bersubtype cash_bank)
    cashAccountId: text("cash_account_id")
      .notNull()
      .references(() => accounts.id),
    amountCents: integer("amount_cents", { mode: "number" }).notNull(),
    currency: text("currency").notNull().default("IDR"),
    rateMicros: integer("rate_micros", { mode: "number" }).notNull().default(1_000_000),
    journalId: text("journal_id").references(() => journals.id),
    memo: text("memo"),
    createdBy: text("created_by"),
    clientId: text("client_id"),
    createdAt: nowMs(),
    updatedAt: updatedAtMs(),
    deletedAt: integer("deleted_at", { mode: "timestamp_ms" }),
  },
  (t) => ({
    orgIdx: index("payments_org_idx").on(t.orgId, t.date),
    contactIdx: index("payments_contact_idx").on(t.orgId, t.contactId),
    clientUniq: uniqueIndex("payments_client_uniq").on(t.orgId, t.clientId),
    directionChk: check("payments_direction_chk", sql`${t.direction} IN ('receive','pay')`),
  }),
);

export const paymentAllocations = sqliteTable(
  "payment_allocations",
  {
    id: uuidPk(),
    orgId: text("org_id").notNull(),
    paymentId: text("payment_id")
      .notNull()
      .references(() => payments.id, { onDelete: "cascade" }),
    targetType: text("target_type", { enum: ["sales_invoice", "purchase_bill"] }).notNull(),
    targetId: text("target_id").notNull(),
    amountCents: integer("amount_cents", { mode: "number" }).notNull(),
  },
  (t) => ({
    paymentIdx: index("payment_allocations_payment_idx").on(t.paymentId),
    targetIdx: index("payment_allocations_target_idx").on(t.orgId, t.targetType, t.targetId),
    targetTypeChk: check(
      "payment_allocations_target_type_chk",
      sql`${t.targetType} IN ('sales_invoice','purchase_bill')`,
    ),
  }),
);

/* ------------------------------- inventory ------------------------------- */

export const warehouses = sqliteTable(
  "warehouses",
  {
    id: uuidPk(),
    orgId: text("org_id").notNull(),
    name: text("name").notNull(),
    isDefault: integer("is_default", { mode: "boolean" }).notNull().default(false),
    isArchived: integer("is_archived", { mode: "boolean" }).notNull().default(false),
    createdAt: nowMs(),
    updatedAt: updatedAtMs(),
  },
  (t) => ({ orgIdx: index("warehouses_org_idx").on(t.orgId) }),
);

export const items = sqliteTable(
  "items",
  {
    id: uuidPk(),
    orgId: text("org_id").notNull(),
    sku: text("sku"),
    name: text("name").notNull(),
    type: text("type", { enum: ["stock", "service"] }).notNull().default("stock"),
    unit: text("unit").notNull().default("pcs"),
    salePriceCents: integer("sale_price_cents", { mode: "number" }).notNull().default(0),
    costMethod: text("cost_method").notNull().default("average"),
    // cache stok & biaya rata-rata (sumber kebenaran tetap stock_moves & ledger)
    qtyOnHand: integer("qty_on_hand").notNull().default(0),
    avgCostCents: integer("avg_cost_cents", { mode: "number" }).notNull().default(0),
    inventoryAccountId: text("inventory_account_id").references(() => accounts.id),
    cogsAccountId: text("cogs_account_id").references(() => accounts.id),
    revenueAccountId: text("revenue_account_id").references(() => accounts.id),
    isArchived: integer("is_archived", { mode: "boolean" }).notNull().default(false),
    createdAt: nowMs(),
    updatedAt: updatedAtMs(),
    deletedAt: integer("deleted_at", { mode: "timestamp_ms" }),
  },
  (t) => ({
    orgIdx: index("items_org_idx").on(t.orgId),
    typeChk: check("items_type_chk", sql`${t.type} IN ('stock','service')`),
  }),
);

export const stockMoves = sqliteTable(
  "stock_moves",
  {
    id: uuidPk(),
    orgId: text("org_id").notNull(),
    itemId: text("item_id")
      .notNull()
      .references(() => items.id),
    warehouseId: text("warehouse_id")
      .notNull()
      .references(() => warehouses.id),
    date: text("date").notNull(),
    // qtyDelta & valueCents bertanda: + masuk, − keluar
    qtyDelta: integer("qty_delta").notNull(),
    unitCostCents: integer("unit_cost_cents", { mode: "number" }).notNull().default(0),
    valueCents: integer("value_cents", { mode: "number" }).notNull().default(0),
    sourceType: text("source_type", {
      enum: ["purchase_bill", "sales_invoice", "adjustment", "opening"],
    }).notNull(),
    sourceId: text("source_id"),
    memo: text("memo"),
    createdAt: nowMs(),
  },
  (t) => ({
    orgItemIdx: index("stock_moves_org_item_idx").on(t.orgId, t.itemId, t.date),
    sourceIdx: index("stock_moves_source_idx").on(t.orgId, t.sourceType, t.sourceId),
    sourceTypeChk: check(
      "stock_moves_source_type_chk",
      sql`${t.sourceType} IN ('purchase_bill','sales_invoice','adjustment','opening')`,
    ),
  }),
);

/* ------------------------------ fixed assets ----------------------------- */

export const fixedAssets = sqliteTable(
  "fixed_assets",
  {
    id: uuidPk(),
    orgId: text("org_id").notNull(),
    name: text("name").notNull(),
    acquisitionDate: text("acquisition_date").notNull(),
    costCents: integer("cost_cents", { mode: "number" }).notNull(),
    salvageValueCents: integer("salvage_value_cents", { mode: "number" }).notNull().default(0),
    usefulLifeMonths: integer("useful_life_months").notNull(),
    method: text("method").notNull().default("straight_line"),
    // cache akumulasi penyusutan (sumber kebenaran tetap depreciation_entries + ledger)
    accumulatedCents: integer("accumulated_cents", { mode: "number" }).notNull().default(0),
    assetAccountId: text("asset_account_id").references(() => accounts.id),
    accumAccountId: text("accum_account_id").references(() => accounts.id),
    expenseAccountId: text("expense_account_id").references(() => accounts.id),
    status: text("status", { enum: ["active", "disposed"] }).notNull().default("active"),
    createdAt: nowMs(),
    updatedAt: updatedAtMs(),
    deletedAt: integer("deleted_at", { mode: "timestamp_ms" }),
  },
  (t) => ({
    orgIdx: index("fixed_assets_org_idx").on(t.orgId),
    statusChk: check("fixed_assets_status_chk", sql`${t.status} IN ('active','disposed')`),
  }),
);

export const depreciationEntries = sqliteTable(
  "depreciation_entries",
  {
    id: uuidPk(),
    orgId: text("org_id").notNull(),
    assetId: text("asset_id")
      .notNull()
      .references(() => fixedAssets.id, { onDelete: "cascade" }),
    date: text("date").notNull(),
    amountCents: integer("amount_cents", { mode: "number" }).notNull(),
    journalId: text("journal_id").references(() => journals.id),
    createdAt: nowMs(),
  },
  (t) => ({ assetIdx: index("depreciation_entries_asset_idx").on(t.orgId, t.assetId) }),
);

/* ------------------------------ exchange rates --------------------------- */

export const exchangeRates = sqliteTable(
  "exchange_rates",
  {
    id: uuidPk(),
    orgId: text("org_id").notNull(),
    currency: text("currency").notNull(), // mis. 'USD'
    rateMicros: integer("rate_micros", { mode: "number" }).notNull(), // base per 1 unit asing × 1e6
    validFrom: text("valid_from").notNull(),
    createdAt: nowMs(),
  },
  (t) => ({ orgIdx: index("exchange_rates_org_idx").on(t.orgId, t.currency, t.validFrom) }),
);

// Meta internal OrgDO — dipakai untuk penanda seeding idempoten (lihat ensureSeeded()
// di durable-objects/org-do.ts) & flag import dump migrasi (restoreFromDump).
export const orgMeta = sqliteTable("org_meta", {
  key: text("key").primaryKey(),
  value: text("value"),
});

export const orgSchema = {
  accountingPeriods,
  accounts,
  numberSequences,
  taxRates,
  journals,
  journalLines,
  contacts,
  salesInvoices,
  salesInvoiceLines,
  purchaseBills,
  purchaseBillLines,
  payments,
  paymentAllocations,
  warehouses,
  items,
  stockMoves,
  fixedAssets,
  depreciationEntries,
  exchangeRates,
  orgMeta,
};

export { sql };
