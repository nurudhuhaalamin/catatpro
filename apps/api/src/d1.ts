import { drizzle } from "drizzle-orm/d1";
import { controlSchema } from "@catatpro/shared";

/** Klien Drizzle untuk D1 (control plane): users, organizations, memberships. */
export function getControlDb(d1: D1Database) {
  return drizzle(d1, { schema: controlSchema, casing: "snake_case" });
}

export type ControlDb = ReturnType<typeof getControlDb>;
