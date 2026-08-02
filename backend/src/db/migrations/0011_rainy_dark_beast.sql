CREATE TABLE "error_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"correlation_id" uuid NOT NULL,
	"error_code" text NOT NULL,
	"method" text NOT NULL,
	"path" text NOT NULL,
	"project_id" uuid,
	"status_code" integer NOT NULL,
	"app_version" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recovery_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"correlation_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "error_events_error_code_idx" ON "error_events" USING btree ("error_code");--> statement-breakpoint
CREATE INDEX "error_events_created_at_idx" ON "error_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "error_events_correlation_id_idx" ON "error_events" USING btree ("correlation_id");--> statement-breakpoint
CREATE INDEX "recovery_events_correlation_id_idx" ON "recovery_events" USING btree ("correlation_id");