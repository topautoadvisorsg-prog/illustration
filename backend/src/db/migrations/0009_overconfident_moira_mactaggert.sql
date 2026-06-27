CREATE TABLE "editions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"edition_key" text NOT NULL,
	"label" text NOT NULL,
	"style_dna_id" text NOT NULL,
	"paper_type" text,
	"palette_override" jsonb,
	"trim_override" jsonb,
	"format_settings" jsonb,
	"is_default" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "editions" ADD CONSTRAINT "editions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "editions_project_key_idx" ON "editions" USING btree ("project_id","edition_key");