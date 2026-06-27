import type {
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
  warehouses,
  items,
  stockMoves,
  fixedAssets,
  depreciationEntries,
  exchangeRates,
} from "./schema.js";

export type Organization = typeof organizations.$inferSelect;
export type Membership = typeof memberships.$inferSelect;
export type AccountingPeriod = typeof accountingPeriods.$inferSelect;
export type Account = typeof accounts.$inferSelect;
export type NumberSequence = typeof numberSequences.$inferSelect;
export type TaxRate = typeof taxRates.$inferSelect;
export type Journal = typeof journals.$inferSelect;
export type JournalLine = typeof journalLines.$inferSelect;
export type Contact = typeof contacts.$inferSelect;
export type SalesInvoice = typeof salesInvoices.$inferSelect;
export type SalesInvoiceLine = typeof salesInvoiceLines.$inferSelect;
export type PurchaseBill = typeof purchaseBills.$inferSelect;
export type PurchaseBillLine = typeof purchaseBillLines.$inferSelect;
export type Payment = typeof payments.$inferSelect;
export type PaymentAllocation = typeof paymentAllocations.$inferSelect;
export type Warehouse = typeof warehouses.$inferSelect;
export type Item = typeof items.$inferSelect;
export type StockMove = typeof stockMoves.$inferSelect;
export type FixedAsset = typeof fixedAssets.$inferSelect;
export type DepreciationEntry = typeof depreciationEntries.$inferSelect;
export type ExchangeRate = typeof exchangeRates.$inferSelect;

export type AccountType = Account["type"];
export type Role = Membership["role"];
export type AccountingStandard = Organization["accountingStandard"];

export interface OrgWithRole extends Organization {
  role: Role;
}
