import type { Membership } from "@catatpro/shared";
import type { Db } from "./db.js";
import type { AuthUser } from "./auth.js";

export interface AppContext {
  Variables: {
    db: Db;
    user: AuthUser;
    membership: Membership;
  };
}
