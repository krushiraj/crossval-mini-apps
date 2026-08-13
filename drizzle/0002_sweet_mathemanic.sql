CREATE TABLE `pricing_documents` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`title` text NOT NULL,
	`customer` text NOT NULL,
	`issue_date` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`subtotal_minor_units` integer DEFAULT 0 NOT NULL,
	`total_discount_minor_units` integer DEFAULT 0 NOT NULL,
	`total_tax_minor_units` integer DEFAULT 0 NOT NULL,
	`grand_total_minor_units` integer DEFAULT 0 NOT NULL,
	`finalized_at` integer,
	`duplicated_from_id` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `pricing_documents_user_issue_date_idx` ON `pricing_documents` (`user_id`,`issue_date`);--> statement-breakpoint
CREATE INDEX `pricing_documents_user_status_idx` ON `pricing_documents` (`user_id`,`status`);--> statement-breakpoint
CREATE TABLE `pricing_line_items` (
	`id` text PRIMARY KEY NOT NULL,
	`document_id` text NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`description` text NOT NULL,
	`quantity` integer NOT NULL,
	`unit_price_minor_units` integer NOT NULL,
	`discount_type` text,
	`discount_value` integer DEFAULT 0 NOT NULL,
	`tax_rate_basis_points` integer DEFAULT 0 NOT NULL,
	`subtotal_minor_units` integer DEFAULT 0 NOT NULL,
	`discount_minor_units` integer DEFAULT 0 NOT NULL,
	`tax_minor_units` integer DEFAULT 0 NOT NULL,
	`total_minor_units` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`document_id`) REFERENCES `pricing_documents`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `pricing_line_items_document_idx` ON `pricing_line_items` (`document_id`,`position`);