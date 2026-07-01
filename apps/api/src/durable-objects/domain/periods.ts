import { and, eq, asc } from "drizzle-orm";
import { accountingPeriods } from "@catatpro/shared";
import type { OrgDbTx } from "../db.js";

export interface PeriodCreate {
  name: string;
  startDate: string;
  endDate: string;
}

export function listPeriods(tx: OrgDbTx, orgId: string) {
  return tx.select().from(accountingPeriods).where(eq(accountingPeriods.orgId, orgId)).orderBy(asc(accountingPeriods.startDate)).all();
}

export function createPeriod(tx: OrgDbTx, orgId: string, d: PeriodCreate) {
  return tx.insert(accountingPeriods).values({ orgId, ...d }).returning().get();
}

export function setPeriodStatus(tx: OrgDbTx, orgId: string, periodId: string, status: "open" | "closed" | "locked") {
  return tx
    .update(accountingPeriods)
    .set({ status, updatedAt: new Date() })
    .where(and(eq(accountingPeriods.orgId, orgId), eq(accountingPeriods.id, periodId)))
    .returning()
    .get();
}
