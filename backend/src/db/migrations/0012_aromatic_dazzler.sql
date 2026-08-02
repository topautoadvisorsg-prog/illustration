CREATE TABLE "operation_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"operation" text NOT NULL,
	"project_id" uuid,
	"duration_ms" integer NOT NULL,
	"success" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "operation_events_operation_idx" ON "operation_events" USING btree ("operation");--> statement-breakpoint
CREATE INDEX "operation_events_created_at_idx" ON "operation_events" USING btree ("created_at");