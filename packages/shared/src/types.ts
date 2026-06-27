import type {
  organizations,
  memberships,
  accountingPeriods,
  accounts,
  numberSequences,
  taxRates,
  journals,
  journalLines,
} from "./schema.js";

export type Organization = typeof organizations.$inferSelect;
export type Membership = typeof memberships.$inferSelect;
export type AccountingPeriod = typeof accountingPeriods.$inferSelect;
export type Account = typeof accounts.$inferSelect;
export type NumberSequence = typeof numberSequences.$inferSelect;
export type TaxRate = typeof taxRates.$inferSelect;
export type Journal = typeof journals.$inferSelect;
export type JournalLine = typeof journalLines.$inferSelect;

export type AccountType = Account["type"];
export type Role = Membership["role"];
export type AccountingStandard = Organization["accountingStandard"];

export interface OrgWithRole extends Organization {
  role: Role;
}
