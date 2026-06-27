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

/* ------------------------------ AR/AP (Fase 2) --------------------------- */

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format tanggal YYYY-MM-DD");

export const contactCreateSchema = z.object({
  name: z.string().trim().min(1, "Nama wajib diisi").max(120),
  type: z.enum(["customer", "supplier", "both"]).default("both"),
  email: z.string().trim().email().optional().nullable().or(z.literal("")),
  phone: z.string().trim().max(40).optional().nullable(),
  npwp: z.string().trim().max(32).optional().nullable(),
  address: z.string().trim().max(500).optional().nullable(),
  note: z.string().trim().max(500).optional().nullable(),
});

const docLineSchema = z.object({
  description: z.string().trim().min(1, "Keterangan wajib").max(200),
  qty: z.number().int().positive().default(1),
  unitPriceCents: z.number().int().min(0),
  accountId: z.string().uuid(), // revenue (jual) / inventory|expense (beli)
  itemId: z.string().uuid().optional().nullable(), // bila baris merujuk item stok
});

const docBase = {
  contactId: z.string().uuid("Kontak wajib dipilih"),
  date: isoDate,
  dueDate: isoDate.optional().nullable(),
  taxRateId: z.string().uuid().optional().nullable(),
  // e-Faktur/Coretax (opsional)
  taxCode: z.string().trim().max(10).optional().nullable(),
  counterpartyNpwp: z.string().trim().max(32).optional().nullable(),
  memo: z.string().trim().max(500).optional().nullable(),
  clientId: z.string().min(1).optional(),
  lines: z.array(docLineSchema).min(1, "Minimal 1 baris"),
};

export const salesInvoiceCreateSchema = z.object(docBase);
export const purchaseBillCreateSchema = z.object(docBase);

export const paymentCreateSchema = z
  .object({
    contactId: z.string().uuid(),
    direction: z.enum(["receive", "pay"]),
    date: isoDate,
    cashAccountId: z.string().uuid("Akun kas/bank wajib dipilih"),
    amountCents: z.number().int().positive("Jumlah harus > 0"),
    memo: z.string().trim().max(500).optional().nullable(),
    clientId: z.string().min(1).optional(),
    allocations: z
      .array(
        z.object({
          targetType: z.enum(["sales_invoice", "purchase_bill"]),
          targetId: z.string().uuid(),
          amountCents: z.number().int().positive(),
        }),
      )
      .default([]),
  })
  .refine(
    (p) => p.allocations.reduce((s, a) => s + a.amountCents, 0) <= p.amountCents,
    "Total alokasi melebihi jumlah pembayaran",
  );

/* ----------------------------- inventory (Fase 3) ------------------------ */

export const itemCreateSchema = z.object({
  sku: z.string().trim().max(40).optional().nullable(),
  name: z.string().trim().min(1, "Nama item wajib").max(120),
  type: z.enum(["stock", "service"]).default("stock"),
  unit: z.string().trim().min(1).max(20).default("pcs"),
  salePriceCents: z.number().int().min(0).default(0),
});

export const stockAdjustmentSchema = z.object({
  itemId: z.string().uuid(),
  date: isoDate,
  // qtyDelta + opening cost (untuk penambahan), atau qtyDelta negatif (pengurangan)
  qtyDelta: z.number().int().refine((v) => v !== 0, "Perubahan qty tidak boleh 0"),
  unitCostCents: z.number().int().min(0).default(0),
  // akun lawan: default ekuitas (stok awal) atau beban (penyusutan stok)
  offsetAccountId: z.string().uuid(),
  memo: z.string().trim().max(500).optional().nullable(),
  clientId: z.string().min(1).optional(),
});

export type OrgCreate = z.infer<typeof orgCreateSchema>;
export type AccountCreate = z.infer<typeof accountCreateSchema>;
export type JournalCreate = z.infer<typeof journalCreateSchema>;
export type ItemCreate = z.infer<typeof itemCreateSchema>;
export type StockAdjustment = z.infer<typeof stockAdjustmentSchema>;
export type ContactCreate = z.infer<typeof contactCreateSchema>;
export type SalesInvoiceCreate = z.infer<typeof salesInvoiceCreateSchema>;
export type PurchaseBillCreate = z.infer<typeof purchaseBillCreateSchema>;
export type PaymentCreate = z.infer<typeof paymentCreateSchema>;
