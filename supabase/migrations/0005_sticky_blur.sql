CREATE TABLE IF NOT EXISTS "exchange_rates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"currency" text NOT NULL,
	"rate_micros" bigint NOT NULL,
	"valid_from" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "currency" text DEFAULT 'IDR' NOT NULL;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "rate_micros" bigint DEFAULT 1000000 NOT NULL;--> statement-breakpoint
ALTER TABLE "purchase_bills" ADD COLUMN "currency" text DEFAULT 'IDR' NOT NULL;--> statement-breakpoint
ALTER TABLE "purchase_bills" ADD COLUMN "rate_micros" bigint DEFAULT 1000000 NOT NULL;--> statement-breakpoint
ALTER TABLE "sales_invoices" ADD COLUMN "currency" text DEFAULT 'IDR' NOT NULL;--> statement-breakpoint
ALTER TABLE "sales_invoices" ADD COLUMN "rate_micros" bigint DEFAULT 1000000 NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "exchange_rates" ADD CONSTRAINT "exchange_rates_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "exchange_rates_org_idx" ON "exchange_rates" USING btree ("org_id","currency","valid_from");