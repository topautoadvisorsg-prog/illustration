CREATE TYPE "public"."fit_status" AS ENUM('PENDING', 'FITS', 'TIGHT', 'OVERFLOW', 'UNDERFILL');--> statement-breakpoint
CREATE TYPE "public"."page_approval_decision" AS ENUM('APPROVED', 'REJECTED', 'RESET');--> statement-breakpoint
CREATE TYPE "public"."page_role" AS ENUM('opener', 'continuation', 'compacted');--> statement-breakpoint
CREATE TABLE "page_approvals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"page_id" uuid NOT NULL,
	"decision" "page_approval_decision" NOT NULL,
	"reason" text,
	"decided_by" text NOT NULL,
	"decided_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pages" ADD COLUMN "entry_key" text;--> statement-breakpoint
ALTER TABLE "pages" ADD COLUMN "part_n" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "pages" ADD COLUMN "total_parts" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "pages" ADD COLUMN "page_role" "page_role" DEFAULT 'opener' NOT NULL;--> statement-breakpoint
ALTER TABLE "pages" ADD COLUMN "carries_subject" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "pages" ADD COLUMN "compacted_entry_keys" jsonb;--> statement-breakpoint
ALTER TABLE "pages" ADD COLUMN "reading_field_text" text;--> statement-breakpoint
ALTER TABLE "pages" ADD COLUMN "reading_field_chars" integer;--> statement-breakpoint
ALTER TABLE "pages" ADD COLUMN "reading_field_words" integer;--> statement-breakpoint
ALTER TABLE "pages" ADD COLUMN "fit_status" "fit_status" DEFAULT 'PENDING' NOT NULL;--> statement-breakpoint
ALTER TABLE "pages" ADD COLUMN "preview_approved" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "pages" ADD COLUMN "preview_approved_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "pages" ADD COLUMN "preview_approved_by" text;--> statement-breakpoint
ALTER TABLE "page_approvals" ADD CONSTRAINT "page_approvals_page_id_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "page_approvals_page_decided_at_idx" ON "page_approvals" USING btree ("page_id","decided_at");--> statement-breakpoint
CREATE INDEX "pages_project_entry_key_idx" ON "pages" USING btree ("project_id","entry_key");--> statement-breakpoint
CREATE INDEX "pages_project_preview_approved_idx" ON "pages" USING btree ("project_id","preview_approved");--> statement-breakpoint
-- Pagination v1 backfill (SPEC §9.1): existing rows predate the pagination stage.
-- They become valid `opener` rows with `total_parts = 1` (defaults already covered
-- by the column NOT NULL DEFAULTs above) and `entry_key = page_key` (set here
-- since the column was added nullable). Operators must explicitly re-paginate
-- to get real splits/continuations/compactions for legacy projects.
UPDATE "pages" SET "entry_key" = "page_key" WHERE "entry_key" IS NULL;