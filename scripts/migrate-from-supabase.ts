/**
 * Migrasi data SATU KALI dari Supabase Postgres ke Cloudflare (D1 + Durable
 * Objects). Skrip manual — BUKAN bagian dari CI, tidak di-lint/tes, tidak
 * dijalankan otomatis oleh siapa pun. Jalankan sendiri, sadar risikonya.
 *
 * Prasyarat:
 *   cd scripts && npm install   (dependensi skrip terpisah dari workspace utama)
 *
 * Env var wajib:
 *   SUPABASE_DATABASE_URL   connection string POOLER Supabase lama (baca-saja cukup)
 *   WORKER_BASE_URL         URL Worker Cloudflare yang SUDAH di-deploy (mis. https://catatpro.<sub>.workers.dev)
 *   MIGRATION_ADMIN_SECRET  sama dengan `wrangler secret put MIGRATION_ADMIN_SECRET` di Worker tsb
 *   D1_DATABASE_NAME        nama database D1 control plane (default: catatpro-control)
 *
 * Cara pakai (dari root repo, BUKAN dari dalam scripts/):
 *   npx tsx scripts/migrate-from-supabase.ts --dry-run          # Fase A-C saja, baca-saja, cetak ringkasan
 *   npx tsx scripts/migrate-from-supabase.ts --phase=extract    # jalankan 1 fase, resume dari checkpoint
 *   npx tsx scripts/migrate-from-supabase.ts                    # jalankan semua fase berurutan
 *
 * Checkpoint disimpan di scripts/.migration-state/ (gitignored) agar skrip
 * bisa dilanjutkan jika terhenti di tengah jalan (proses ini bisa berjam-jam
 * untuk Fase B karena butuh koordinasi manual re-signup user asli).
 */
import { writeFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import postgres from "postgres";

const STATE_DIR = new URL("./.migration-state/", import.meta.url);
mkdirSync(STATE_DIR, { recursive: true });
const statePath = (name: string) => new URL(name, STATE_DIR);

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const PHASE = args.find((a) => a.startsWith("--phase="))?.split("=")[1] ?? "all";

const SUPABASE_DATABASE_URL = process.env.SUPABASE_DATABASE_URL;
const WORKER_BASE_URL = process.env.WORKER_BASE_URL;
const MIGRATION_ADMIN_SECRET = process.env.MIGRATION_ADMIN_SECRET;
const D1_DATABASE_NAME = process.env.D1_DATABASE_NAME ?? "catatpro-control";

// Urutan tabel org-scoped yang aman-FK (induk sebelum anak) — sama seperti
// RESTORE_ORDER di apps/api/src/durable-objects/org-do.ts.
const ORG_TABLES = [
  "accounting_periods",
  "accounts",
  "number_sequences",
  "tax_rates",
  "warehouses",
  "contacts",
  "items",
  "exchange_rates",
  "journals",
  "journal_lines",
  "sales_invoices",
  "sales_invoice_lines",
  "purchase_bills",
  "purchase_bill_lines",
  "payments",
  "payment_allocations",
  "stock_moves",
  "fixed_assets",
  "depreciation_entries",
] as const;

// camelCase, sesuai key di packages/shared/src/schema.org.ts `orgSchema`
// (dipakai OrgDO.restoreFromDump untuk resolve tabel Drizzle-nya).
const toCamel = (s: string) => s.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());

interface Dump {
  organizations: Record<string, unknown>[];
  memberships: Record<string, unknown>[];
  authUsers: { id: string; email: string }[];
  orgTables: Record<string, Record<string, unknown>[]>; // key = snake_case table name
}

/* --------------------------------- Fase A --------------------------------- */

async function extractFromSupabase(): Promise<Dump> {
  if (!SUPABASE_DATABASE_URL) throw new Error("SUPABASE_DATABASE_URL wajib diisi");
  const sql = postgres(SUPABASE_DATABASE_URL, { prepare: false });
  try {
    const organizations = await sql`SELECT * FROM organizations`;
    const memberships = await sql`SELECT * FROM memberships`;
    const authUsers = await sql`SELECT id, email FROM auth.users`;

    const orgTables: Dump["orgTables"] = {};
    for (const table of ORG_TABLES) {
      // Nama tabel berasal dari daftar tetap di atas (bukan input pengguna) — aman dari SQL injection.
      orgTables[table] = await sql.unsafe(`SELECT * FROM ${table}`);
    }

    const dump: Dump = {
      organizations: organizations as unknown as Record<string, unknown>[],
      memberships: memberships as unknown as Record<string, unknown>[],
      authUsers: authUsers as unknown as { id: string; email: string }[],
      orgTables,
    };
    writeFileSync(statePath("01-extract.json"), JSON.stringify(dump, null, 2));
    console.log(
      `[extract] organizations=${dump.organizations.length} memberships=${dump.memberships.length} ` +
        `authUsers=${dump.authUsers.length} ` +
        ORG_TABLES.map((t) => `${t}=${dump.orgTables[t].length}`).join(" "),
    );
    return dump;
  } finally {
    await sql.end();
  }
}

/* --------------------------------- Fase B --------------------------------- */

interface UserMap {
  [oldUserId: string]: { email: string; newUserId: string };
}

/**
 * Hash password Supabase (bcrypt via GoTrue) TIDAK bisa dipindah ke skema
 * PBKDF2 baru — user asli WAJIB signup ulang dengan email sama di sistem
 * baru. Fase ini:
 *   1. Bila `scripts/.migration-state/02-user-map.json` sudah ada (operator
 *      sudah menjalankan signup manual & menulis mapping), pakai itu.
 *   2. Bila belum & ada `--auto-signup` (HANYA untuk data uji/seed, BUKAN
 *      user produksi nyata), skrip men-signup semua email dengan password
 *      acak yang dicetak ke console (operator harus catat/bagikan).
 *   3. Bila belum & tanpa --auto-signup, skrip BERHENTI dan mencetak
 *      instruksi: operator signup manual tiap email lewat UI/`curl
 *      POST /api/auth/signup`, lalu isi 02-user-map.json.
 */
async function buildUserMap(dump: Dump): Promise<UserMap> {
  const mapPath = statePath("02-user-map.json");
  if (existsSync(mapPath)) {
    return JSON.parse(readFileSync(mapPath, "utf8"));
  }

  if (!WORKER_BASE_URL) throw new Error("WORKER_BASE_URL wajib diisi");
  const autoSignup = args.includes("--auto-signup");
  const map: UserMap = {};

  if (autoSignup) {
    console.warn("[signup] --auto-signup aktif: HANYA pakai untuk data uji, bukan akun user nyata.");
    for (const u of dump.authUsers) {
      const password = crypto.randomUUID();
      const res = await fetch(`${WORKER_BASE_URL}/api/auth/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: u.email, password }),
      });
      const body = (await res.json()) as { token?: string; user?: { id: string } };
      if (!res.ok || !body.user) throw new Error(`Signup gagal untuk ${u.email}: ${JSON.stringify(body)}`);
      map[u.id] = { email: u.email, newUserId: body.user.id };
      console.log(`[signup] ${u.email} -> ${body.user.id} (password: ${password})`);
    }
    writeFileSync(mapPath, JSON.stringify(map, null, 2));
    return map;
  }

  console.log(`
[signup] Perlu signup ulang MANUAL untuk ${dump.authUsers.length} user (hash password lama tidak portabel):
${dump.authUsers.map((u) => `  - ${u.email} (id lama: ${u.id})`).join("\n")}

Langkah:
  1. Minta tiap user signup ulang di aplikasi baru dengan EMAIL YANG SAMA (password baru bebas).
     (Atau untuk akun sendiri/testing: POST ${WORKER_BASE_URL}/api/auth/signup { email, password })
  2. Catat "user.id" dari respons signup masing-masing.
  3. Tulis mapping ke ${mapPath.pathname}:
     { "<id-lama-1>": { "email": "...", "newUserId": "<id-baru-1>" }, ... }
  4. Jalankan ulang skrip ini (fase ini akan otomatis lanjut membaca file itu).
`);
  process.exit(0);
}

/* --------------------------------- Fase C --------------------------------- */

function remapForeignKeys(dump: Dump, userMap: UserMap): Dump {
  const newId = (oldId: string | null | undefined): string | null => {
    if (!oldId) return null;
    return userMap[oldId]?.newUserId ?? null; // fallback null bila user tak ditemukan (kolom nullable)
  };

  const organizations = dump.organizations.map((o) => ({ ...o, owner_user_id: newId(o.owner_user_id as string) }));
  const memberships = dump.memberships
    .map((m) => ({ ...m, user_id: newId(m.user_id as string) }))
    .filter((m) => m.user_id !== null); // membership tanpa user valid tak berguna
  const orgTables = { ...dump.orgTables };
  for (const table of ["journals", "sales_invoices", "purchase_bills", "payments"] as const) {
    orgTables[table] = orgTables[table].map((r) => ("created_by" in r ? { ...r, created_by: newId(r.created_by as string) } : r));
  }

  const remapped: Dump = { ...dump, organizations, memberships, orgTables };
  writeFileSync(statePath("03-remapped.json"), JSON.stringify(remapped, null, 2));
  return remapped;
}

/* --------------------------------- Fase D --------------------------------- */

function snakeToCamelRow(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) out[toCamel(k)] = v;
  return out;
}

async function writeToD1(dump: Dump): Promise<void> {
  if (dump.organizations.length === 0) return;
  const esc = (v: unknown) => (v === null || v === undefined ? "NULL" : `'${String(v).replace(/'/g, "''")}'`);
  const stmts: string[] = [];
  for (const o of dump.organizations) {
    stmts.push(
      `INSERT INTO organizations (id,name,owner_user_id,accounting_standard,base_currency,npwp,created_at,updated_at,deleted_at) VALUES ` +
        `(${esc(o.id)},${esc(o.name)},${esc(o.owner_user_id)},${esc(o.accounting_standard)},${esc(o.base_currency)},${esc(o.npwp)},` +
        `${Date.parse(String(o.created_at))},${Date.parse(String(o.updated_at))},${o.deleted_at ? Date.parse(String(o.deleted_at)) : "NULL"});`,
    );
  }
  for (const m of dump.memberships) {
    stmts.push(
      `INSERT INTO memberships (id,org_id,user_id,role,created_at,updated_at) VALUES ` +
        `(${esc(m.id)},${esc(m.org_id)},${esc(m.user_id)},${esc(m.role)},${Date.parse(String(m.created_at))},${Date.parse(String(m.updated_at))});`,
    );
  }
  const sqlFile = statePath("04-d1-insert.sql");
  writeFileSync(sqlFile, stmts.join("\n"));
  console.log(`[d1] Menerapkan ${stmts.length} statement ke D1 "${D1_DATABASE_NAME}" (--remote)...`);
  execFileSync("npx", ["wrangler", "d1", "execute", D1_DATABASE_NAME, "--remote", `--file=${sqlFile.pathname}`], {
    stdio: "inherit",
  });
}

async function writeToOrgDOs(dump: Dump): Promise<void> {
  if (!WORKER_BASE_URL || !MIGRATION_ADMIN_SECRET) throw new Error("WORKER_BASE_URL & MIGRATION_ADMIN_SECRET wajib diisi");
  for (const org of dump.organizations) {
    const orgId = org.id as string;
    const orgDump: Record<string, unknown[]> = {};
    for (const table of ORG_TABLES) {
      orgDump[toCamel(table)] = dump.orgTables[table].filter((r) => r.org_id === orgId).map(snakeToCamelRow);
    }
    console.log(`[orgdo] restoreFromDump untuk org ${orgId} (${org.name})...`);
    const res = await fetch(`${WORKER_BASE_URL}/api/admin/orgs/${orgId}/seed-raw`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-migration-secret": MIGRATION_ADMIN_SECRET },
      body: JSON.stringify(orgDump),
    });
    const body = await res.json();
    if (!res.ok) throw new Error(`restoreFromDump gagal untuk org ${orgId}: ${JSON.stringify(body)}`);
    console.log(`[orgdo] org ${orgId} selesai:`, body);
  }
}

/* --------------------------------- Fase E --------------------------------- */

async function verify(dump: Dump): Promise<void> {
  if (!WORKER_BASE_URL) throw new Error("WORKER_BASE_URL wajib diisi");
  for (const org of dump.organizations) {
    const orgId = org.id as string;
    // Trial balance "before" dihitung langsung dari dump journal_lines (bukan re-query Supabase,
    // supaya tetap valid walau Supabase sudah dimatikan setelah extract).
    const linesBefore = dump.orgTables.journal_lines.filter((l) => l.org_id === orgId);
    const debitBefore = linesBefore.reduce((s, l) => s + Number(l.debit_cents), 0);
    const creditBefore = linesBefore.reduce((s, l) => s + Number(l.credit_cents), 0);

    // Trial balance "after" dari API baru — perlu token user pemilik org; asumsikan operator
    // login manual & set TEST_JWT env var untuk verifikasi ini (opsional, bisa dilewati).
    if (!process.env.VERIFY_JWT) {
      console.log(`[verify] org ${orgId}: before debit=${debitBefore} credit=${creditBefore} (set VERIFY_JWT untuk cek "after" via API)`);
      continue;
    }
    const res = await fetch(`${WORKER_BASE_URL}/api/orgs/${orgId}/reports/trial-balance`, {
      headers: { Authorization: `Bearer ${process.env.VERIFY_JWT}` },
    });
    const after = (await res.json()) as { totalDebit: number; totalCredit: number; balanced: boolean };
    const ok = after.totalDebit === debitBefore && after.totalCredit === creditBefore && after.balanced;
    console.log(`[verify] org ${orgId}: before=(${debitBefore},${creditBefore}) after=(${after.totalDebit},${after.totalCredit}) ${ok ? "✅ COCOK" : "❌ TIDAK COCOK"}`);
  }
}

/* ---------------------------------- main ----------------------------------- */

async function main() {
  let dump: Dump;
  if (PHASE === "all" || PHASE === "extract") {
    dump = await extractFromSupabase();
  } else {
    dump = JSON.parse(readFileSync(statePath("01-extract.json"), "utf8"));
  }

  if (DRY_RUN) {
    console.log("[dry-run] Berhenti setelah extract — tidak menulis apa pun ke Cloudflare.");
    return;
  }

  const userMap = await buildUserMap(dump);
  const remapped = remapForeignKeys(dump, userMap);

  if (PHASE === "extract") return;

  await writeToD1(remapped);
  await writeToOrgDOs(remapped);
  await verify(remapped);

  console.log(`
[selesai] Migrasi data selesai. Langkah lanjutan (manual):
  1. Verifikasi menyeluruh (login ke tiap org, cek laporan) sebelum menghapus apa pun.
  2. Hapus rute migrasi: apps/api/src/routes/admin.ts, OrgDO.restoreFromDump di org-do.ts,
     app.route("/admin", admin) di app.ts, dan secret MIGRATION_ADMIN_SECRET.
  3. Setelah yakin, project Supabase lama & docs/SUPABASE.md boleh dihapus/dinonaktifkan.
`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
