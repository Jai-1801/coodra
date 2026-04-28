ALTER TABLE `pending_jobs` ADD `picked_at` integer;--> statement-breakpoint
ALTER TABLE `pending_jobs` ADD `failed_at` integer;--> statement-breakpoint
ALTER TABLE `pending_jobs` ADD `last_error` text;--> statement-breakpoint
CREATE INDEX `pending_jobs_picked_idx` ON `pending_jobs` (`status`,`picked_at`);