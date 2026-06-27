import type { Membership } from "@catatpro/shared";
import type { Db } from "./db.js";
import type { AuthUser } from "./auth.js";

// Binding/variabel lingkungan. Di Workers diisi dari wrangler.toml/secret;
// di Node (dev) kosong → fallback ke process.env.
export interface AppBindings {
  ASSETS?: { fetch: (request: Request) => Promise<Response> };
  HYPERDRIVE?: { connectionString: string };
  DATABASE_URL?: string;
  SUPABASE_JWT_SECRET?: string;
  WEB_ORIGIN?: string;
}

export interface AppContext {
  Bindings: AppBindings;
  Variables: {
    db: Db;
    user: AuthUser;
    membership: Membership;
  };
}
