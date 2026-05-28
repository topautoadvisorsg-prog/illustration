CREATE TYPE "public"."audience" AS ENUM('ADULT');--> statement-breakpoint
CREATE TYPE "public"."brand" AS ENUM('THE_WILDLANDS');--> statement-breakpoint
CREATE TYPE "public"."export_kind" AS ENUM('PREMIUM_PDF', 'KINDLE_EPUB');--> statement-breakpoint
CREATE TYPE "public"."export_status" AS ENUM('REQUESTED', 'RUNNING', 'READY', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."image_status" AS ENUM('GENERATED', 'REVIEW', 'APPROVED', 'REJECTED', 'UPSCALING', 'PRINT_READY', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."job_status" AS ENUM('queued', 'active', 'completed', 'failed', 'dead-lettered');--> statement-breakpoint
CREATE TYPE "public"."job_type" AS ENUM('image-generation', 'upscale', 'layout', 'pdf-compile', 'epub-export');--> statement-breakpoint
CREATE TYPE "public"."manifest_kind" AS ENUM('BOOK', 'CHAPTER', 'PAGE');--> statement-breakpoint
CREATE TYPE "public"."page_status" AS ENUM('PENDING', 'PLANNED', 'GENERATING', 'REVIEW', 'APPROVED', 'UPSCALING', 'PRINT_READY', 'LAID_OUT', 'FAILED_DPI', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."project_status" AS ENUM('DRAFT', 'MANUSCRIPT_UPLOADED', 'MANIFESTED', 'PLANNED', 'GENERATING', 'IMAGE_REVIEW', 'UPSCALED', 'LAYOUT_READY', 'EXPORTED', 'FAILED');--> statement-breakpoint
CREATE TABLE "exports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"kind" "export_kind" NOT NULL,
	"status" "export_status" DEFAULT 'REQUESTED' NOT NULL,
	"file_path" text,
	"sha256" text,
	"file_size_bytes" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "image_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"image_id" uuid NOT NULL,
	"page_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"note" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "images" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"page_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"prompt" text NOT NULL,
	"prompt_sha256" text NOT NULL,
	"generated_path" text,
	"upscaled_path" text,
	"dpi_w" integer,
	"dpi_h" integer,
	"width_px" integer,
	"height_px" integer,
	"active" boolean DEFAULT false NOT NULL,
	"status" "image_status" DEFAULT 'GENERATED' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bullmq_job_id" text,
	"project_id" uuid,
	"page_id" uuid,
	"job_type" "job_type" NOT NULL,
	"status" "job_status" DEFAULT 'queued' NOT NULL,
	"idempotency_key" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"error_message" text,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "llm_usage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid,
	"page_id" uuid,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"operation" text NOT NULL,
	"input_tokens" integer,
	"output_tokens" integer,
	"image_count" integer,
	"cost_usd" numeric(10, 4),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "manifests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"kind" "manifest_kind" NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"external_id" text NOT NULL,
	"content" jsonb NOT NULL,
	"locked" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"manifest_id" uuid,
	"page_key" text NOT NULL,
	"chapter_number" integer NOT NULL,
	"planned_page_number" integer NOT NULL,
	"layout_template" text,
	"image_prompt" text,
	"image_prompt_sha256" text,
	"status" "page_status" DEFAULT 'PENDING' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid,
	"brand" "brand" DEFAULT 'THE_WILDLANDS' NOT NULL,
	"audience" "audience" DEFAULT 'ADULT' NOT NULL,
	"volume" integer NOT NULL,
	"title" text NOT NULL,
	"subtitle" text,
	"author_name" text NOT NULL,
	"config" jsonb NOT NULL,
	"manuscript_path" text,
	"manuscript_sha256" text,
	"status" "project_status" DEFAULT 'DRAFT' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"display_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "exports" ADD CONSTRAINT "exports_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "image_events" ADD CONSTRAINT "image_events_image_id_images_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."images"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "image_events" ADD CONSTRAINT "image_events_page_id_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "images" ADD CONSTRAINT "images_page_id_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_page_id_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "llm_usage" ADD CONSTRAINT "llm_usage_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "llm_usage" ADD CONSTRAINT "llm_usage_page_id_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."pages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manifests" ADD CONSTRAINT "manifests_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pages" ADD CONSTRAINT "pages_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pages" ADD CONSTRAINT "pages_manifest_id_manifests_id_fk" FOREIGN KEY ("manifest_id") REFERENCES "public"."manifests"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "images_page_version_idx" ON "images" USING btree ("page_id","version");--> statement-breakpoint
CREATE INDEX "images_page_active_idx" ON "images" USING btree ("page_id","active");--> statement-breakpoint
CREATE UNIQUE INDEX "jobs_idempotency_key_idx" ON "jobs" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "jobs_status_idx" ON "jobs" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "manifests_project_kind_external_version_idx" ON "manifests" USING btree ("project_id","kind","external_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "pages_project_page_key_idx" ON "pages" USING btree ("project_id","page_key");--> statement-breakpoint
CREATE INDEX "pages_project_status_idx" ON "pages" USING btree ("project_id","status");