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

export const schema = {
  organizations,
  memberships,
  accountingPeriods,
  accounts,
  numberSequences,
  taxRates,
  journals,
  journalLines,
};

export { sql };
