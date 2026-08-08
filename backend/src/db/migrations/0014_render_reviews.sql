CREATE TYPE "public"."render_review_method" AS ENUM('OPERATOR_MANUAL', 'AI_CHAT', 'AI_API');--> statement-breakpoint
CREATE TYPE "public"."render_review_status" AS ENUM('APPROVED', 'ISSUE_FOUND', 'UNCERTAIN');--> statement-breakpoint
CREATE TABLE "render_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"render_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"status" "render_review_status" NOT NULL,
	"method" "render_review_method" NOT NULL,
	"findings" jsonb,
	"notes" text,
	"reviewed_by" text NOT NULL,
	"reviewer_label" text,
	"reviewed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pages" ADD COLUMN "review_escalation_reason" text;--> statement-breakpoint
ALTER TABLE "render_reviews" ADD CONSTRAINT "render_reviews_render_id_whole_page_renders_id_fk" FOREIGN KEY ("render_id") REFERENCES "public"."whole_page_renders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "render_reviews" ADD CONSTRAINT "render_reviews_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "render_reviews_render_idx" ON "render_reviews" USING btree ("render_id","reviewed_at");--> statement-breakpoint
CREATE INDEX "render_reviews_project_idx" ON "render_reviews" USING btree ("project_id");