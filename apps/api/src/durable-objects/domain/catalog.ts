import { and, eq, desc, asc, isNull } from "drizzle-orm";
import { accounts, taxRates, exchangeRates, type ExchangeRateCreate } from "@catatpro/shared";
import type { OrgDbTx } from "../db.js";

export function listAccounts(tx: OrgDbTx, orgId: string) {
  return tx
    .select()
    .from(accounts)
    .where(and(eq(accounts.orgId, orgId), isNull(accounts.deletedAt)))
    .orderBy(asc(accounts.code))
    .all();
}

export function listTaxRates(tx: OrgDbTx, orgId: string) {
  return tx
    .select()
    .from(taxRates)
    .where(and(eq(taxRates.orgId, orgId), eq(taxRates.isActive, true)))
    .all();
}

export function listExchangeRates(tx: OrgDbTx, orgId: string) {
  return tx.select().from(exchangeRates).where(eq(exchangeRates.orgId, orgId)).orderBy(desc(exchangeRates.validFrom)).all();
}

export function addExchangeRate(tx: OrgDbTx, orgId: string, d: ExchangeRateCreate) {
  return tx.insert(exchangeRates).values({ orgId, ...d }).returning().get();
}
