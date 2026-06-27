import { z } from "zod";

/* Skema validasi dipakai bersama API (server) & web (client). */

export const roleSchema = z.enum(["owner", "admin", "pencatat", "viewer"]);
export const accountingStandardSchema = z.enum(["emkm", "ep", "sak"]);

export const orgCreateSchema = z.object({
  name: z.string().trim().min(1, "Nama usaha wajib diisi").max(120),
  accountingStandard: accountingStandardSchema.default("emkm"),
  baseCurrency: z.string().trim().length(3).default("IDR"),
  npwp: z.string().trim().max(32).optional().nullable(),
});

export const memberCreateSchema = z.object({
  email: z.string().trim().email("Email tidak valid"),
  role: roleSchema.default("pencatat"),
});

export const accountCreateSchema = z.object({
  code: z.string().trim().min(1).max(20),
  name: z.string().trim().min(1).max(120),
  type: z.enum(["asset", "liability", "equity", "income", "expense"]),
  subtype: z.string().trim().max(40).optional().nullable(),
  normalBalance: z.enum(["debit", "credit"]),
  parentId: z.string().uuid().optional().nullable(),
  isPostable: z.boolean().default(true),
});

// Satu baris jurnal manual.
export const journalLineSchema = z
  .object({
    accountId: z.string().uuid(),
    debitCents: z.number().int().min(0).default(0),
    creditCents: z.number().int().min(0).default(0),
    contactId: z.string().uuid().optional().nullable(),
    memo: z.string().trim().max(500).optional().nullable(),
  })
  .refine((l) => !(l.debitCents > 0 && l.creditCents > 0), "Baris tidak boleh debit & kredit sekaligus")
  .refine((l) => l.debitCents > 0 || l.creditCents > 0, "Baris harus punya nilai debit atau kredit");

// Jurnal manual: harus minimal 2 baris dan berimbang.
export const journalCreateSchema = z
  .object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format tanggal YYYY-MM-DD"),
    memo: z.string().trim().max(500).optional().nullable(),
    clientId: z.string().min(1).optional(),
    lines: z.array(journalLineSchema).min(2, "Jurnal minimal 2 baris"),
  })
  .refine((j) => {
    const d = j.lines.reduce((s, l) => s + l.debitCents, 0);
    const c = j.lines.reduce((s, l) => s + l.creditCents, 0);
    return d === c && d > 0;
  }, "Jurnal harus berimbang (Σdebit = Σkredit) dan tidak nol");

export type OrgCreate = z.infer<typeof orgCreateSchema>;
export type AccountCreate = z.infer<typeof accountCreateSchema>;
export type JournalCreate = z.infer<typeof journalCreateSchema>;
