import type { AppBindings } from "../env.js";
import type { OrgDO } from "./org-do.js";

/** Resolve stub OrgDO untuk satu organisasi (satu nama org = satu instance DO global). */
export function getOrgStub(env: AppBindings, orgId: string): DurableObjectStub<OrgDO> {
  const id = env.ORG_DO.idFromName(orgId);
  return env.ORG_DO.get(id);
}
