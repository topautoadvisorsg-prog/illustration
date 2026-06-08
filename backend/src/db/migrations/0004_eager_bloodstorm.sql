ALTER TABLE "whole_page_renders" ADD COLUMN "print_png_path" text;--> statement-breakpoint
ALTER TABLE "whole_page_renders" ADD COLUMN "print_pdf_path" text;--> statement-breakpoint
ALTER TABLE "whole_page_renders" ADD COLUMN "preflight_passed" boolean;