import { sql } from "drizzle-orm";
import {
  pgTable,
  pgEnum,
  uuid,
  text,
  bigint,
  integer,
  boolean,
  date,
  timestamp,
  index,
  uniqueIndex,
  check,
} from "drizzle-orm/pg-core";

/* -------------------------------------------------------------------------- */
/*  CatatPro — skema inti akuntansi (Postgres / Supabase).                      */
/*                                                                            */
/*  Prinsip:                                                                   */
/*  - Multi-tenant: SEMUA tabel data punya org_id; query WAJIB difilter org_id */
/*    + dilindungi RLS Postgres (lihat supabase/migrations/*_rls.sql).         */
/*  - Buku besar (journals + journal_lines) adalah SUMBER KEBENARAN. Semua     */
/*    laporan diturunkan darinya.                                              */
/*  - Uang disimpan sebagai integer "sen" (bigint). IDR default.              */
/*  - Standar akuntansi konfigurabel per organisasi (SAK EMKM/EP/SAK).        */
/* -------------------------------------------------------------------------- */

const now = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const accountingStandardEnum = pgEnum("accounting_standard", ["emkm", "ep", "sak"]);
export const roleEnum = pgEnum("member_role", ["owner", "admin", "pencatat", "viewer"]);
export const periodStatusEnum = pgEnum("period_status", ["open", "closed", "locked"]);
export const accountTypeEnum = pgEnum("account_type", ["asset", "liability", "equity", "income", "expense"]);
export const normalBalanceEnum = pgEnum("normal_balance", ["debit", "credit"]);
export const journalStatusEnum = pgEnum("journal_status", ["draft", "posted", "void"]);
export const taxAppliesEnum = pgEnum("tax_applies_to", ["sales", "purchase", "both"]);
export const contactTypeEnum = pgEnum("contact_type", ["customer", "supplier", "both"]);
export const docStatusEnum = pgEnum("doc_status", ["draft", "posted", "partial", "paid", "void"]);
export const paymentDirectionEnum = pgEnum("payment_direction", ["receive", "pay"]);
export const allocationTargetEnum = pgEnum("allocation_target", ["sales_invoice", "purchase_bill"]);

/* ------------------------------- tenancy --------------------------------- */

export const organizations = pgTable(
  "organizations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    // user id dari Supabase Auth (auth.users.id). Tidak di-FK agar skema portabel.
    ownerUserId: uuid("owner_user_id").notNull(),
    // Memilih template COA & set laporan (lihat docs/ACCOUNTING.md, Bagian 4b blueprint).
    accountingStandard: accountingStandardEnum("accounting_standard").notNull().default("emkm"),
    baseCurrency: text("base_currency").notNull().default("IDR"),
    npwp: text("npwp"),
    createdAt: now(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => ({ ownerIdx: index("organizations_owner_idx").on(t.ownerUserId) }),
);

export const memberships = pgTable(
  "memberships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull(),
    role: roleEnum("role").notNull().default("pencatat"),
    createdAt: now(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uniqMember: uniqueIndex("memberships_org_user_uniq").on(t.orgId, t.userId),
    userIdx: index("memberships_user_idx").on(t.userId),
  }),
);

/* -------------------------------- periods -------------------------------- */

export const accountingPeriods = pgTable(
  "accounting_periods",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(), // mis. "2026-01"
    startDate: date("start_date").notNull(),
    endDate: date("end_date").notNull(),
    status: periodStatusEnum("status").notNull().default("open"),
    createdAt: now(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index("periods_org_idx").on(t.orgId),
    uniqName: uniqueIndex("periods_org_name_uniq").on(t.orgId, t.name),
  }),
);

/* ----------------------------- chart of accounts -------------------------- */

export const accounts = pgTable(
  "accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    code: text("code").notNull(), // mis. "1-10001"
    name: text("name").notNull(),
    type: accountTypeEnum("type").notNull(),
    // subtype semantik untuk posting otomatis & pemetaan laporan
    // mis. cash_bank, accounts_receivable, inventory, accounts_payable,
    //      tax_output, tax_input, revenue, cogs, expense, equity, retained_earnings
    subtype: text("subtype"),
    normalBalance: normalBalanceEnum("normal_balance").notNull(),
    parentId: uuid("parent_id"),
    isPostable: boolean("is_postable").notNull().default(true),
    isArchived: boolean("is_archived").notNull().default(false),
    createdAt: now(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => ({
    orgIdx: index("accounts_org_idx").on(t.orgId),
    uniqCode: uniqueIndex("accounts_org_code_uniq").on(t.orgId, t.code),
  }),
);

/* --------------------------- document numbering --------------------------- */

export const numberSequences = pgTable(
  "number_sequences",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    docType: text("doc_type").notNull(), // journal | sales_invoice | purchase_bill | payment | ...
    prefix: text("prefix").notNull().default(""),
    period: text("period").notNull().default(""), // "" = berkelanjutan; "2026" / "2026-01" = per periode
    nextValue: bigint("next_value", { mode: "number" }).notNull().default(1),
    padding: integer("padding").notNull().default(4),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uniqSeq: uniqueIndex("number_sequences_uniq").on(t.orgId, t.docType, t.period),
  }),
);

/* -------------------------------- tax rates ------------------------------- */

export const taxRates = pgTable(
  "tax_rates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(), // mis. "PPN 12% (DPP 11/12)"
    appliesTo: taxAppliesEnum("applies_to").notNull().default("both"),
    // Tarif dalam basis points (1200 = 12%).
    rateBps: integer("rate_bps").notNull(),
    // DPP Nilai Lain (PMK 131/2024 & 11/2025): tarif efektif = rate * num/den.
    dppFactorNum: integer("dpp_factor_num").notNull().default(1),
    dppFactorDen: integer("dpp_factor_den").notNull().default(1),
    accountId: uuid("account_id").references(() => accounts.id),
    validFrom: date("valid_from").notNull(),
    validTo: date("valid_to"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: now(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ orgIdx: index("tax_rates_org_idx").on(t.orgId) }),
);

/* --------------------------------- ledger -------------------------------- */

export const journals = pgTable(
  "journals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    number: text("number"),
    date: date("date").notNull(),
    periodId: uuid("period_id").references(() => accountingPeriods.id),
    // dokumen sumber yang memicu jurnal ini (manual bila jurnal umum)
    sourceType: text("source_type").notNull().default("manual"),
    sourceId: uuid("source_id"),
    status: journalStatusEnum("status").notNull().default("posted"),
    memo: text("memo"),
    createdBy: uuid("created_by"),
    // idempotensi: jurnal yang sama dari klien tidak diposting dua kali
    clientId: text("client_id"),
    // koreksi via pembalik, bukan edit
    reversedByJournalId: uuid("reversed_by_journal_id"),
    createdAt: now(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    postedAt: timestamp("posted_at", { withTimezone: true }),
  },
  (t) => ({
    orgDateIdx: index("journals_org_date_idx").on(t.orgId, t.date),
    sourceIdx: index("journals_source_idx").on(t.orgId, t.sourceType, t.sourceId),
    clientUniq: uniqueIndex("journals_client_uniq").on(t.orgId, t.clientId),
  }),
);

export const journalLines = pgTable(
  "journal_lines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    journalId: uuid("journal_id")
      .notNull()
      .references(() => journals.id, { onDelete: "cascade" }),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id),
    debitCents: bigint("debit_cents", { mode: "number" }).notNull().default(0),
    creditCents: bigint("credit_cents", { mode: "number" }).notNull().default(0),
    contactId: uuid("contact_id"),
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

export const contacts = pgTable(
  "contacts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    type: contactTypeEnum("type").notNull().default("both"),
    email: text("email"),
    phone: text("phone"),
    npwp: text("npwp"),
    address: text("address"),
    note: text("note"),
    createdAt: now(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => ({ orgIdx: index("contacts_org_idx").on(t.orgId) }),
);

/* ------------------------------- sales (AR) ------------------------------ */

export const salesInvoices = pgTable(
  "sales_invoices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    number: text("number"),
    contactId: uuid("contact_id")
      .notNull()
      .references(() => contacts.id),
    date: date("date").notNull(),
    dueDate: date("due_date"),
    status: docStatusEnum("status").notNull().default("posted"),
    subtotalCents: bigint("subtotal_cents", { mode: "number" }).notNull().default(0),
    taxCents: bigint("tax_cents", { mode: "number" }).notNull().default(0),
    totalCents: bigint("total_cents", { mode: "number" }).notNull().default(0),
    paidCents: bigint("paid_cents", { mode: "number" }).notNull().default(0),
    taxRateId: uuid("tax_rate_id").references(() => taxRates.id),
    journalId: uuid("journal_id").references(() => journals.id),
    memo: text("memo"),
    createdBy: uuid("created_by"),
    clientId: text("client_id"),
    createdAt: now(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => ({
    orgIdx: index("sales_invoices_org_idx").on(t.orgId, t.date),
    contactIdx: index("sales_invoices_contact_idx").on(t.orgId, t.contactId),
    clientUniq: uniqueIndex("sales_invoices_client_uniq").on(t.orgId, t.clientId),
  }),
);

export const salesInvoiceLines = pgTable(
  "sales_invoice_lines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => salesInvoices.id, { onDelete: "cascade" }),
    lineNo: integer("line_no").notNull().default(0),
    description: text("description").notNull(),
    qty: integer("qty").notNull().default(1),
    unitPriceCents: bigint("unit_price_cents", { mode: "number" }).notNull().default(0),
    amountCents: bigint("amount_cents", { mode: "number" }).notNull().default(0),
    revenueAccountId: uuid("revenue_account_id")
      .notNull()
      .references(() => accounts.id),
  },
  (t) => ({ invoiceIdx: index("sales_invoice_lines_invoice_idx").on(t.invoiceId) }),
);

/* ----------------------------- purchases (AP) ---------------------------- */

export const purchaseBills = pgTable(
  "purchase_bills",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    number: text("number"),
    contactId: uuid("contact_id")
      .notNull()
      .references(() => contacts.id),
    date: date("date").notNull(),
    dueDate: date("due_date"),
    status: docStatusEnum("status").notNull().default("posted"),
    subtotalCents: bigint("subtotal_cents", { mode: "number" }).notNull().default(0),
    taxCents: bigint("tax_cents", { mode: "number" }).notNull().default(0),
    totalCents: bigint("total_cents", { mode: "number" }).notNull().default(0),
    paidCents: bigint("paid_cents", { mode: "number" }).notNull().default(0),
    taxRateId: uuid("tax_rate_id").references(() => taxRates.id),
    journalId: uuid("journal_id").references(() => journals.id),
    memo: text("memo"),
    createdBy: uuid("created_by"),
    clientId: text("client_id"),
    createdAt: now(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => ({
    orgIdx: index("purchase_bills_org_idx").on(t.orgId, t.date),
    contactIdx: index("purchase_bills_contact_idx").on(t.orgId, t.contactId),
    clientUniq: uniqueIndex("purchase_bills_client_uniq").on(t.orgId, t.clientId),
  }),
);

export const purchaseBillLines = pgTable(
  "purchase_bill_lines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    billId: uuid("bill_id")
      .notNull()
      .references(() => purchaseBills.id, { onDelete: "cascade" }),
    lineNo: integer("line_no").notNull().default(0),
    description: text("description").notNull(),
    qty: integer("qty").notNull().default(1),
    unitPriceCents: bigint("unit_price_cents", { mode: "number" }).notNull().default(0),
    amountCents: bigint("amount_cents", { mode: "number" }).notNull().default(0),
    // akun debet: persediaan (inventory) atau beban (expense)
    debitAccountId: uuid("debit_account_id")
      .notNull()
      .references(() => accounts.id),
  },
  (t) => ({ billIdx: index("purchase_bill_lines_bill_idx").on(t.billId) }),
);

/* ------------------------------- payments -------------------------------- */

export const payments = pgTable(
  "payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    number: text("number"),
    contactId: uuid("contact_id")
      .notNull()
      .references(() => contacts.id),
    direction: paymentDirectionEnum("direction").notNull(),
    date: date("date").notNull(),
    // akun kas/bank (akun COA bersubtype cash_bank)
    cashAccountId: uuid("cash_account_id")
      .notNull()
      .references(() => accounts.id),
    amountCents: bigint("amount_cents", { mode: "number" }).notNull(),
    journalId: uuid("journal_id").references(() => journals.id),
    memo: text("memo"),
    createdBy: uuid("created_by"),
    clientId: text("client_id"),
    createdAt: now(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => ({
    orgIdx: index("payments_org_idx").on(t.orgId, t.date),
    contactIdx: index("payments_contact_idx").on(t.orgId, t.contactId),
    clientUniq: uniqueIndex("payments_client_uniq").on(t.orgId, t.clientId),
  }),
);

export const paymentAllocations = pgTable(
  "payment_allocations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    paymentId: uuid("payment_id")
      .notNull()
      .references(() => payments.id, { onDelete: "cascade" }),
    targetType: allocationTargetEnum("target_type").notNull(),
    targetId: uuid("target_id").notNull(),
    amountCents: bigint("amount_cents", { mode: "number" }).notNull(),
  },
  (t) => ({
    paymentIdx: index("payment_allocations_payment_idx").on(t.paymentId),
    targetIdx: index("payment_allocations_target_idx").on(t.orgId, t.targetType, t.targetId),
  }),
);

export const schema = {
  organizations,
  memberships,
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
};

export { sql };
