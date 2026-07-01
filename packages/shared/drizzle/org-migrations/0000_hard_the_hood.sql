CREATE TABLE `accounting_periods` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`name` text NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "periods_status_chk" CHECK("accounting_periods"."status" IN ('open','closed','locked'))
);
--> statement-breakpoint
CREATE INDEX `periods_org_idx` ON `accounting_periods` (`org_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `periods_org_name_uniq` ON `accounting_periods` (`org_id`,`name`);--> statement-breakpoint
CREATE TABLE `accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`subtype` text,
	`normal_balance` text NOT NULL,
	`parent_id` text,
	`is_postable` integer DEFAULT true NOT NULL,
	`is_archived` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	CONSTRAINT "accounts_type_chk" CHECK("accounts"."type" IN ('asset','liability','equity','income','expense')),
	CONSTRAINT "accounts_normal_balance_chk" CHECK("accounts"."normal_balance" IN ('debit','credit'))
);
--> statement-breakpoint
CREATE INDEX `accounts_org_idx` ON `accounts` (`org_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `accounts_org_code_uniq` ON `accounts` (`org_id`,`code`);--> statement-breakpoint
CREATE TABLE `contacts` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`name` text NOT NULL,
	`type` text DEFAULT 'both' NOT NULL,
	`email` text,
	`phone` text,
	`npwp` text,
	`address` text,
	`note` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	CONSTRAINT "contacts_type_chk" CHECK("contacts"."type" IN ('customer','supplier','both'))
);
--> statement-breakpoint
CREATE INDEX `contacts_org_idx` ON `contacts` (`org_id`);--> statement-breakpoint
CREATE TABLE `depreciation_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`asset_id` text NOT NULL,
	`date` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`journal_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`asset_id`) REFERENCES `fixed_assets`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`journal_id`) REFERENCES `journals`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `depreciation_entries_asset_idx` ON `depreciation_entries` (`org_id`,`asset_id`);--> statement-breakpoint
CREATE TABLE `exchange_rates` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`currency` text NOT NULL,
	`rate_micros` integer NOT NULL,
	`valid_from` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `exchange_rates_org_idx` ON `exchange_rates` (`org_id`,`currency`,`valid_from`);--> statement-breakpoint
CREATE TABLE `fixed_assets` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`name` text NOT NULL,
	`acquisition_date` text NOT NULL,
	`cost_cents` integer NOT NULL,
	`salvage_value_cents` integer DEFAULT 0 NOT NULL,
	`useful_life_months` integer NOT NULL,
	`method` text DEFAULT 'straight_line' NOT NULL,
	`accumulated_cents` integer DEFAULT 0 NOT NULL,
	`asset_account_id` text,
	`accum_account_id` text,
	`expense_account_id` text,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`asset_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`accum_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`expense_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "fixed_assets_status_chk" CHECK("fixed_assets"."status" IN ('active','disposed'))
);
--> statement-breakpoint
CREATE INDEX `fixed_assets_org_idx` ON `fixed_assets` (`org_id`);--> statement-breakpoint
CREATE TABLE `items` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`sku` text,
	`name` text NOT NULL,
	`type` text DEFAULT 'stock' NOT NULL,
	`unit` text DEFAULT 'pcs' NOT NULL,
	`sale_price_cents` integer DEFAULT 0 NOT NULL,
	`cost_method` text DEFAULT 'average' NOT NULL,
	`qty_on_hand` integer DEFAULT 0 NOT NULL,
	`avg_cost_cents` integer DEFAULT 0 NOT NULL,
	`inventory_account_id` text,
	`cogs_account_id` text,
	`revenue_account_id` text,
	`is_archived` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`inventory_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`cogs_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`revenue_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "items_type_chk" CHECK("items"."type" IN ('stock','service'))
);
--> statement-breakpoint
CREATE INDEX `items_org_idx` ON `items` (`org_id`);--> statement-breakpoint
CREATE TABLE `journal_lines` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`journal_id` text NOT NULL,
	`account_id` text NOT NULL,
	`debit_cents` integer DEFAULT 0 NOT NULL,
	`credit_cents` integer DEFAULT 0 NOT NULL,
	`contact_id` text,
	`memo` text,
	`line_no` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`journal_id`) REFERENCES `journals`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "journal_lines_debit_credit_chk" CHECK("journal_lines"."debit_cents" >= 0 AND "journal_lines"."credit_cents" >= 0 AND NOT ("journal_lines"."debit_cents" > 0 AND "journal_lines"."credit_cents" > 0))
);
--> statement-breakpoint
CREATE INDEX `journal_lines_org_account_idx` ON `journal_lines` (`org_id`,`account_id`);--> statement-breakpoint
CREATE INDEX `journal_lines_journal_idx` ON `journal_lines` (`journal_id`);--> statement-breakpoint
CREATE TABLE `journals` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`number` text,
	`date` text NOT NULL,
	`period_id` text,
	`source_type` text DEFAULT 'manual' NOT NULL,
	`source_id` text,
	`status` text DEFAULT 'posted' NOT NULL,
	`memo` text,
	`created_by` text,
	`client_id` text,
	`reversed_by_journal_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`posted_at` integer,
	FOREIGN KEY (`period_id`) REFERENCES `accounting_periods`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "journals_status_chk" CHECK("journals"."status" IN ('draft','posted','void'))
);
--> statement-breakpoint
CREATE INDEX `journals_org_date_idx` ON `journals` (`org_id`,`date`);--> statement-breakpoint
CREATE INDEX `journals_source_idx` ON `journals` (`org_id`,`source_type`,`source_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `journals_client_uniq` ON `journals` (`org_id`,`client_id`);--> statement-breakpoint
CREATE TABLE `number_sequences` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`doc_type` text NOT NULL,
	`prefix` text DEFAULT '' NOT NULL,
	`period` text DEFAULT '' NOT NULL,
	`next_value` integer DEFAULT 1 NOT NULL,
	`padding` integer DEFAULT 4 NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `number_sequences_uniq` ON `number_sequences` (`org_id`,`doc_type`,`period`);--> statement-breakpoint
CREATE TABLE `org_meta` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text
);
--> statement-breakpoint
CREATE TABLE `payment_allocations` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`payment_id` text NOT NULL,
	`target_type` text NOT NULL,
	`target_id` text NOT NULL,
	`amount_cents` integer NOT NULL,
	FOREIGN KEY (`payment_id`) REFERENCES `payments`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "payment_allocations_target_type_chk" CHECK("payment_allocations"."target_type" IN ('sales_invoice','purchase_bill'))
);
--> statement-breakpoint
CREATE INDEX `payment_allocations_payment_idx` ON `payment_allocations` (`payment_id`);--> statement-breakpoint
CREATE INDEX `payment_allocations_target_idx` ON `payment_allocations` (`org_id`,`target_type`,`target_id`);--> statement-breakpoint
CREATE TABLE `payments` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`number` text,
	`contact_id` text NOT NULL,
	`direction` text NOT NULL,
	`date` text NOT NULL,
	`cash_account_id` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`currency` text DEFAULT 'IDR' NOT NULL,
	`rate_micros` integer DEFAULT 1000000 NOT NULL,
	`journal_id` text,
	`memo` text,
	`created_by` text,
	`client_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`contact_id`) REFERENCES `contacts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`cash_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`journal_id`) REFERENCES `journals`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "payments_direction_chk" CHECK("payments"."direction" IN ('receive','pay'))
);
--> statement-breakpoint
CREATE INDEX `payments_org_idx` ON `payments` (`org_id`,`date`);--> statement-breakpoint
CREATE INDEX `payments_contact_idx` ON `payments` (`org_id`,`contact_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `payments_client_uniq` ON `payments` (`org_id`,`client_id`);--> statement-breakpoint
CREATE TABLE `purchase_bill_lines` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`bill_id` text NOT NULL,
	`line_no` integer DEFAULT 0 NOT NULL,
	`description` text NOT NULL,
	`qty` integer DEFAULT 1 NOT NULL,
	`unit_price_cents` integer DEFAULT 0 NOT NULL,
	`amount_cents` integer DEFAULT 0 NOT NULL,
	`debit_account_id` text NOT NULL,
	FOREIGN KEY (`bill_id`) REFERENCES `purchase_bills`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`debit_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `purchase_bill_lines_bill_idx` ON `purchase_bill_lines` (`bill_id`);--> statement-breakpoint
CREATE TABLE `purchase_bills` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`number` text,
	`contact_id` text NOT NULL,
	`date` text NOT NULL,
	`due_date` text,
	`status` text DEFAULT 'posted' NOT NULL,
	`subtotal_cents` integer DEFAULT 0 NOT NULL,
	`tax_cents` integer DEFAULT 0 NOT NULL,
	`total_cents` integer DEFAULT 0 NOT NULL,
	`paid_cents` integer DEFAULT 0 NOT NULL,
	`tax_rate_id` text,
	`currency` text DEFAULT 'IDR' NOT NULL,
	`rate_micros` integer DEFAULT 1000000 NOT NULL,
	`tax_code` text,
	`counterparty_npwp` text,
	`journal_id` text,
	`memo` text,
	`created_by` text,
	`client_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`contact_id`) REFERENCES `contacts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`tax_rate_id`) REFERENCES `tax_rates`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`journal_id`) REFERENCES `journals`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "purchase_bills_status_chk" CHECK("purchase_bills"."status" IN ('draft','posted','partial','paid','void'))
);
--> statement-breakpoint
CREATE INDEX `purchase_bills_org_idx` ON `purchase_bills` (`org_id`,`date`);--> statement-breakpoint
CREATE INDEX `purchase_bills_contact_idx` ON `purchase_bills` (`org_id`,`contact_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `purchase_bills_client_uniq` ON `purchase_bills` (`org_id`,`client_id`);--> statement-breakpoint
CREATE TABLE `sales_invoice_lines` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`invoice_id` text NOT NULL,
	`line_no` integer DEFAULT 0 NOT NULL,
	`description` text NOT NULL,
	`qty` integer DEFAULT 1 NOT NULL,
	`unit_price_cents` integer DEFAULT 0 NOT NULL,
	`amount_cents` integer DEFAULT 0 NOT NULL,
	`revenue_account_id` text NOT NULL,
	FOREIGN KEY (`invoice_id`) REFERENCES `sales_invoices`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`revenue_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `sales_invoice_lines_invoice_idx` ON `sales_invoice_lines` (`invoice_id`);--> statement-breakpoint
CREATE TABLE `sales_invoices` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`number` text,
	`contact_id` text NOT NULL,
	`date` text NOT NULL,
	`due_date` text,
	`status` text DEFAULT 'posted' NOT NULL,
	`subtotal_cents` integer DEFAULT 0 NOT NULL,
	`tax_cents` integer DEFAULT 0 NOT NULL,
	`total_cents` integer DEFAULT 0 NOT NULL,
	`paid_cents` integer DEFAULT 0 NOT NULL,
	`tax_rate_id` text,
	`currency` text DEFAULT 'IDR' NOT NULL,
	`rate_micros` integer DEFAULT 1000000 NOT NULL,
	`tax_code` text,
	`counterparty_npwp` text,
	`journal_id` text,
	`memo` text,
	`created_by` text,
	`client_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`contact_id`) REFERENCES `contacts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`tax_rate_id`) REFERENCES `tax_rates`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`journal_id`) REFERENCES `journals`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "sales_invoices_status_chk" CHECK("sales_invoices"."status" IN ('draft','posted','partial','paid','void'))
);
--> statement-breakpoint
CREATE INDEX `sales_invoices_org_idx` ON `sales_invoices` (`org_id`,`date`);--> statement-breakpoint
CREATE INDEX `sales_invoices_contact_idx` ON `sales_invoices` (`org_id`,`contact_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `sales_invoices_client_uniq` ON `sales_invoices` (`org_id`,`client_id`);--> statement-breakpoint
CREATE TABLE `stock_moves` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`item_id` text NOT NULL,
	`warehouse_id` text NOT NULL,
	`date` text NOT NULL,
	`qty_delta` integer NOT NULL,
	`unit_cost_cents` integer DEFAULT 0 NOT NULL,
	`value_cents` integer DEFAULT 0 NOT NULL,
	`source_type` text NOT NULL,
	`source_id` text,
	`memo` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`warehouse_id`) REFERENCES `warehouses`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "stock_moves_source_type_chk" CHECK("stock_moves"."source_type" IN ('purchase_bill','sales_invoice','adjustment','opening'))
);
--> statement-breakpoint
CREATE INDEX `stock_moves_org_item_idx` ON `stock_moves` (`org_id`,`item_id`,`date`);--> statement-breakpoint
CREATE INDEX `stock_moves_source_idx` ON `stock_moves` (`org_id`,`source_type`,`source_id`);--> statement-breakpoint
CREATE TABLE `tax_rates` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`name` text NOT NULL,
	`applies_to` text DEFAULT 'both' NOT NULL,
	`rate_bps` integer NOT NULL,
	`dpp_factor_num` integer DEFAULT 1 NOT NULL,
	`dpp_factor_den` integer DEFAULT 1 NOT NULL,
	`account_id` text,
	`valid_from` text NOT NULL,
	`valid_to` text,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "tax_rates_applies_chk" CHECK("tax_rates"."applies_to" IN ('sales','purchase','both'))
);
--> statement-breakpoint
CREATE INDEX `tax_rates_org_idx` ON `tax_rates` (`org_id`);--> statement-breakpoint
CREATE TABLE `warehouses` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`name` text NOT NULL,
	`is_default` integer DEFAULT false NOT NULL,
	`is_archived` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `warehouses_org_idx` ON `warehouses` (`org_id`);