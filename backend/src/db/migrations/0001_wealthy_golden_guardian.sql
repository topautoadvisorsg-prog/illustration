CREATE TYPE "public"."cost_operation" AS ENUM('LLM', 'IMAGE_GENERATION', 'UPSCALE', 'PDF_RENDER', 'EPUB_EXPORT', 'STORAGE', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."knowledge_evidence_type" AS ENUM('FILE', 'URL', 'SCREENSHOT', 'PDF', 'IMAGE', 'NOTE', 'COST_REPORT', 'PROOF_PHOTO');--> statement-breakpoint
CREATE TYPE "public"."knowledge_item_type" AS ENUM('EXPERIMENT', 'DECISION', 'STANDARD', 'SOP', 'COST_RECORD', 'PRINT_REVIEW', 'LESSON');--> statement-breakpoint
CREATE TYPE "public"."knowledge_relation_type" AS ENUM('DERIVED_FROM', 'PRODUCED_DECISION', 'PROMOTED_TO_STANDARD', 'UPDATES_SOP', 'SUPERSEDES', 'EVIDENCED_BY', 'AFFECTS', 'RELATED_TO');--> statement-breakpoint
CREATE TYPE "public"."knowledge_scope" AS ENUM('GLOBAL', 'PROJECT', 'BOOK', 'CHAPTER', 'PAGE', 'LAYOUT', 'WORKFLOW');--> statement-breakpoint
CREATE TYPE "public"."knowledge_status" AS ENUM('DRAFT', 'RUNNING', 'CONCLUDED', 'ACCEPTED', 'REJECTED', 'LOCKED', 'SUPERSEDED', 'ARCHIVED');--> statement-breakpoint
CREATE TYPE "public"."print_finding_category" AS ENUM('MARGIN', 'TYPOGRAPHY', 'IMAGE_QUALITY', 'PAPER', 'COVER', 'KDP', 'COLOR', 'BINDING', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."print_finding_severity" AS ENUM('LOW', 'MEDIUM', 'HIGH', 'BLOCKER');--> statement-breakpoint
CREATE TABLE "cost_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_id" uuid NOT NULL,
	"project_id" uuid,
	"page_id" uuid,
	"provider" text NOT NULL,
	"model" text,
	"operation" "cost_operation" NOT NULL,
	"quantity" numeric(12, 4) NOT NULL,
	"unit_cost_usd" numeric(10, 6),
	"cost_usd" numeric(10, 4) NOT NULL,
	"incurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"metadata" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cost_events_item_id_unique" UNIQUE("item_id")
);
--> statement-breakpoint
CREATE TABLE "decisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_id" uuid NOT NULL,
	"decision" text NOT NULL,
	"reason" text NOT NULL,
	"accepted_at" timestamp with time zone,
	"superseded_by_item_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "decisions_item_id_unique" UNIQUE("item_id")
);
--> statement-breakpoint
CREATE TABLE "experiments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_id" uuid NOT NULL,
	"hypothesis" text NOT NULL,
	"test_performed" text NOT NULL,
	"result" text,
	"conclusion" text,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "experiments_item_id_unique" UNIQUE("item_id")
);
--> statement-breakpoint
CREATE TABLE "knowledge_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"actor_name" text,
	"summary" text NOT NULL,
	"previous_value" jsonb,
	"next_value" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_evidence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_id" uuid NOT NULL,
	"evidence_type" "knowledge_evidence_type" NOT NULL,
	"title" text NOT NULL,
	"uri" text,
	"storage_path" text,
	"sha256" text,
	"mime_type" text,
	"notes" text,
	"metadata" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid,
	"type" "knowledge_item_type" NOT NULL,
	"title" text NOT NULL,
	"summary" text,
	"status" "knowledge_status" DEFAULT 'DRAFT' NOT NULL,
	"scope" "knowledge_scope" DEFAULT 'GLOBAL' NOT NULL,
	"owner_name" text,
	"tags" jsonb NOT NULL,
	"metadata" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_item_id" uuid NOT NULL,
	"target_item_id" uuid NOT NULL,
	"relation_type" "knowledge_relation_type" NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lessons_learned" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_id" uuid NOT NULL,
	"lesson" text NOT NULL,
	"prevention" text,
	"applies_to" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lessons_learned_item_id_unique" UNIQUE("item_id")
);
--> statement-breakpoint
CREATE TABLE "print_findings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"print_review_id" uuid NOT NULL,
	"related_item_id" uuid,
	"severity" "print_finding_severity" NOT NULL,
	"category" "print_finding_category" NOT NULL,
	"page_key" text,
	"layout_template" text,
	"finding" text NOT NULL,
	"recommendation" text,
	"status" text DEFAULT 'OPEN' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "print_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_id" uuid NOT NULL,
	"proof_name" text NOT NULL,
	"vendor" text NOT NULL,
	"format" text NOT NULL,
	"ordered_at" timestamp with time zone,
	"received_at" timestamp with time zone,
	"overall_status" text DEFAULT 'OPEN' NOT NULL,
	"metadata" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "print_reviews_item_id_unique" UNIQUE("item_id")
);
--> statement-breakpoint
CREATE TABLE "sop_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sop_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"body_markdown" text NOT NULL,
	"checklist" jsonb NOT NULL,
	"change_notes" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sops" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_id" uuid NOT NULL,
	"workflow_name" text NOT NULL,
	"current_version_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sops_item_id_unique" UNIQUE("item_id")
);
--> statement-breakpoint
CREATE TABLE "standard_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"standard_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"value" jsonb NOT NULL,
	"rationale" text NOT NULL,
	"effective_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "standards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_id" uuid NOT NULL,
	"domain" text NOT NULL,
	"standard_key" text NOT NULL,
	"current_version_id" uuid,
	"locked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "standards_item_id_unique" UNIQUE("item_id")
);
--> statement-breakpoint
ALTER TABLE "cost_events" ADD CONSTRAINT "cost_events_item_id_knowledge_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."knowledge_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cost_events" ADD CONSTRAINT "cost_events_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cost_events" ADD CONSTRAINT "cost_events_page_id_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."pages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decisions" ADD CONSTRAINT "decisions_item_id_knowledge_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."knowledge_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decisions" ADD CONSTRAINT "decisions_superseded_by_item_id_knowledge_items_id_fk" FOREIGN KEY ("superseded_by_item_id") REFERENCES "public"."knowledge_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "experiments" ADD CONSTRAINT "experiments_item_id_knowledge_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."knowledge_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_events" ADD CONSTRAINT "knowledge_events_item_id_knowledge_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."knowledge_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_evidence" ADD CONSTRAINT "knowledge_evidence_item_id_knowledge_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."knowledge_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_items" ADD CONSTRAINT "knowledge_items_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_links" ADD CONSTRAINT "knowledge_links_source_item_id_knowledge_items_id_fk" FOREIGN KEY ("source_item_id") REFERENCES "public"."knowledge_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_links" ADD CONSTRAINT "knowledge_links_target_item_id_knowledge_items_id_fk" FOREIGN KEY ("target_item_id") REFERENCES "public"."knowledge_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lessons_learned" ADD CONSTRAINT "lessons_learned_item_id_knowledge_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."knowledge_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "print_findings" ADD CONSTRAINT "print_findings_print_review_id_print_reviews_id_fk" FOREIGN KEY ("print_review_id") REFERENCES "public"."print_reviews"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "print_findings" ADD CONSTRAINT "print_findings_related_item_id_knowledge_items_id_fk" FOREIGN KEY ("related_item_id") REFERENCES "public"."knowledge_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "print_reviews" ADD CONSTRAINT "print_reviews_item_id_knowledge_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."knowledge_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sop_versions" ADD CONSTRAINT "sop_versions_sop_id_sops_id_fk" FOREIGN KEY ("sop_id") REFERENCES "public"."sops"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sops" ADD CONSTRAINT "sops_item_id_knowledge_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."knowledge_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "standard_versions" ADD CONSTRAINT "standard_versions_standard_id_standards_id_fk" FOREIGN KEY ("standard_id") REFERENCES "public"."standards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "standards" ADD CONSTRAINT "standards_item_id_knowledge_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."knowledge_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cost_events_project_operation_idx" ON "cost_events" USING btree ("project_id","operation");--> statement-breakpoint
CREATE INDEX "cost_events_incurred_at_idx" ON "cost_events" USING btree ("incurred_at");--> statement-breakpoint
CREATE INDEX "knowledge_events_item_created_idx" ON "knowledge_events" USING btree ("item_id","created_at");--> statement-breakpoint
CREATE INDEX "knowledge_evidence_item_idx" ON "knowledge_evidence" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "knowledge_evidence_type_idx" ON "knowledge_evidence" USING btree ("evidence_type");--> statement-breakpoint
CREATE INDEX "knowledge_items_project_type_idx" ON "knowledge_items" USING btree ("project_id","type");--> statement-breakpoint
CREATE INDEX "knowledge_items_status_idx" ON "knowledge_items" USING btree ("status");--> statement-breakpoint
CREATE INDEX "knowledge_items_scope_idx" ON "knowledge_items" USING btree ("scope");--> statement-breakpoint
CREATE INDEX "knowledge_items_created_at_idx" ON "knowledge_items" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_links_lineage_idx" ON "knowledge_links" USING btree ("source_item_id","target_item_id","relation_type");--> statement-breakpoint
CREATE INDEX "knowledge_links_source_idx" ON "knowledge_links" USING btree ("source_item_id");--> statement-breakpoint
CREATE INDEX "knowledge_links_target_idx" ON "knowledge_links" USING btree ("target_item_id");--> statement-breakpoint
CREATE INDEX "print_findings_review_severity_idx" ON "print_findings" USING btree ("print_review_id","severity");--> statement-breakpoint
CREATE INDEX "print_findings_category_idx" ON "print_findings" USING btree ("category");--> statement-breakpoint
CREATE UNIQUE INDEX "sop_versions_sop_version_idx" ON "sop_versions" USING btree ("sop_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "standard_versions_standard_version_idx" ON "standard_versions" USING btree ("standard_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "standards_domain_key_idx" ON "standards" USING btree ("domain","standard_key");