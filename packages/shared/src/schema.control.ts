import { sqliteTable, text, integer, index, uniqueIndex, check } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

/* -------------------------------------------------------------------------- */
/*  CatatPro — skema control plane (Cloudflare D1).                           */
/*                                                                            */
/*  Hanya 3 tabel lintas-organisasi: users (auth), organizations, memberships. */
/*  Semua data ber-org (akuntansi, dsb.) hidup di OrgDO masing-masing         */
/*  (lihat schema.org.ts) — D1 TIDAK menyimpan data akuntansi apa pun.        */
/* -------------------------------------------------------------------------- */

const nowMs = () =>
  integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date());

export const users = sqliteTable("users", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  email: text("email").notNull(),
  passwordHash: text("password_hash").notNull(),
  createdAt: nowMs(),
}, (t) => ({
  emailUniq: uniqueIndex("users_email_uniq").on(t.email),
}));

export const organizations = sqliteTable("organizations", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  // FK logis ke users.id (bukan FK fisik lintas-tabel karena beda batas transaksi).
  ownerUserId: text("owner_user_id").notNull(),
  accountingStandard: text("accounting_standard", { enum: ["emkm", "ep", "sak"] })
    .notNull()
    .default("emkm"),
  baseCurrency: text("base_currency").notNull().default("IDR"),
  npwp: text("npwp"),
  createdAt: nowMs(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
  deletedAt: integer("deleted_at", { mode: "timestamp_ms" }),
}, (t) => ({
  ownerIdx: index("organizations_owner_idx").on(t.ownerUserId),
  standardChk: check(
    "organizations_accounting_standard_chk",
    sql`${t.accountingStandard} IN ('emkm','ep','sak')`,
  ),
}));

export const memberships = sqliteTable("memberships", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  orgId: text("org_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  role: text("role", { enum: ["owner", "admin", "pencatat", "viewer"] })
    .notNull()
    .default("pencatat"),
  createdAt: nowMs(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
}, (t) => ({
  uniqMember: uniqueIndex("memberships_org_user_uniq").on(t.orgId, t.userId),
  userIdx: index("memberships_user_idx").on(t.userId),
  roleChk: check("memberships_role_chk", sql`${t.role} IN ('owner','admin','pencatat','viewer')`),
}));

export const controlSchema = { users, organizations, memberships };
