ALTER TABLE "pages" ADD COLUMN "readable_words" integer;--> statement-breakpoint
ALTER TABLE "pages" ADD COLUMN "readable_chars" integer;--> statement-breakpoint
ALTER TABLE "pages" ADD COLUMN "text_blocks" integer;--> statement-breakpoint
ALTER TABLE "pages" ADD COLUMN "review_route_override" text;--> statement-breakpoint
ALTER TABLE "pages" ADD COLUMN "review_route_override_by" text;--> statement-breakpoint
ALTER TABLE "pages" ADD COLUMN "review_route_override_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "high_text_word_threshold" integer;--> statement-breakpoint
CREATE INDEX "pages_project_readable_words_idx" ON "pages" USING btree ("project_id","readable_words");