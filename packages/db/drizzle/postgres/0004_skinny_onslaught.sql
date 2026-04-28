ALTER TABLE "pending_jobs" ADD COLUMN "picked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "pending_jobs" ADD COLUMN "failed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "pending_jobs" ADD COLUMN "last_error" text;--> statement-breakpoint
CREATE INDEX "pending_jobs_picked_idx" ON "pending_jobs" USING btree ("status","picked_at");