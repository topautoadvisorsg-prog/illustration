CREATE TABLE "entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"entry_key" text NOT NULL,
	"chapter_number" integer NOT NULL,
	"chapter_title" text,
	"entry_title" text NOT NULL,
	"scientific_name" text,
	"section" text DEFAULT 'BODY' NOT NULL,
	"entry_type" text,
	"first_page_key" text NOT NULL,
	"page_keys" jsonb NOT NULL,
	"page_count" integer NOT NULL,
	"reading_order" integer NOT NULL,
	"word_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "entries" ADD CONSTRAINT "entries_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "entries_project_entry_key_idx" ON "entries" USING btree ("project_id","entry_key");--> statement-breakpoint
CREATE INDEX "entries_project_reading_order_idx" ON "entries" USING btree ("project_id","reading_order");