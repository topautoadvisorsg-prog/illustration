CREATE TYPE "public"."page_section" AS ENUM('FRONT_MATTER', 'BODY', 'BACK_MATTER');--> statement-breakpoint
ALTER TABLE "pages" ADD COLUMN "section" "page_section" DEFAULT 'BODY' NOT NULL;--> statement-breakpoint
ALTER TABLE "pages" ADD COLUMN "front_matter_type" text;--> statement-breakpoint
ALTER TABLE "pages" ADD COLUMN "spine_order" integer;--> statement-breakpoint
ALTER TABLE "pages" ADD COLUMN "page_label" text;