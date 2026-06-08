CREATE TYPE "public"."whole_page_render_status" AS ENUM('QUEUED', 'RENDERING', 'RENDERED', 'APPROVED', 'REJECTED', 'FAILED');--> statement-breakpoint
CREATE TABLE "whole_page_renders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"page_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"status" "whole_page_render_status" DEFAULT 'QUEUED' NOT NULL,
	"spec_json" jsonb NOT NULL,
	"assembled_prompt" text NOT NULL,
	"prompt_sha256" text NOT NULL,
	"standard_version" text NOT NULL,
	"image_path" text,
	"spec_path" text,
	"prompt_path" text,
	"width_px" integer,
	"height_px" integer,
	"model" text,
	"active" boolean DEFAULT false NOT NULL,
	"approved_for_book" boolean DEFAULT false NOT NULL,
	"decided_by" text,
	"decided_at" timestamp with time zone,
	"rejection_reason" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "whole_page_renders" ADD CONSTRAINT "whole_page_renders_page_id_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whole_page_renders" ADD CONSTRAINT "whole_page_renders_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "wpr_page_version_idx" ON "whole_page_renders" USING btree ("page_id","version");--> statement-breakpoint
CREATE INDEX "wpr_page_active_idx" ON "whole_page_renders" USING btree ("page_id","active");--> statement-breakpoint
CREATE INDEX "wpr_project_status_idx" ON "whole_page_renders" USING btree ("project_id","status");