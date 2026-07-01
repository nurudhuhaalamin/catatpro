import { and, eq, isNull, asc } from "drizzle-orm";
import { contacts, type ContactCreate } from "@catatpro/shared";
import type { OrgDbTx } from "../db.js";

export function listContacts(tx: OrgDbTx, orgId: string) {
  return tx
    .select()
    .from(contacts)
    .where(and(eq(contacts.orgId, orgId), isNull(contacts.deletedAt)))
    .orderBy(asc(contacts.name))
    .all();
}

export function createContact(tx: OrgDbTx, orgId: string, d: ContactCreate) {
  return tx
    .insert(contacts)
    .values({
      orgId,
      name: d.name,
      type: d.type,
      email: d.email || null,
      phone: d.phone ?? null,
      npwp: d.npwp ?? null,
      address: d.address ?? null,
      note: d.note ?? null,
    })
    .returning()
    .get();
}
