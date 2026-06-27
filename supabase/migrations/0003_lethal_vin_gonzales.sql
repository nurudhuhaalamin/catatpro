ALTER TABLE "purchase_bills" ADD COLUMN "tax_code" text;--> statement-breakpoint
ALTER TABLE "purchase_bills" ADD COLUMN "counterparty_npwp" text;--> statement-breakpoint
ALTER TABLE "sales_invoices" ADD COLUMN "tax_code" text;--> statement-breakpoint
ALTER TABLE "sales_invoices" ADD COLUMN "counterparty_npwp" text;