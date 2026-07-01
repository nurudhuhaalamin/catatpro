import type { Membership } from "@catatpro/shared";
import type { AuthUser } from "./auth.js";
import type { OrgDO } from "./durable-objects/org-do.js";

// Binding/variabel lingkungan Worker (diisi dari wrangler.toml/secret).
export interface AppBindings {
  ASSETS?: { fetch: (request: Request) => Promise<Response> };
  CATATPRO_DB: D1Database; // control plane: users, organizations, memberships
  ORG_DO: DurableObjectNamespace<OrgDO>; // data plane: satu OrgDO per organisasi
  AUTH_JWT_SECRET: string;
  WEB_ORIGIN?: string;
  // Secret sementara khusus migrasi data dari Supabase — lihat routes/admin.ts.
  // Dihapus setelah migrasi selesai diverifikasi.
  MIGRATION_ADMIN_SECRET?: string;
}

export interface AppContext {
  Bindings: AppBindings;
  Variables: {
    user: AuthUser;
    membership: Membership;
  };
}
