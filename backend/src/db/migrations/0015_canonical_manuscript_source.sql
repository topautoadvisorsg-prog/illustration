-- Canonical source artifact vs derived working manuscript.
--
-- Before this, ingest sanitized the upload and stored ONLY the sanitized result,
-- so a frozen manuscript's SHA-256 could never be verified against the platform:
-- the hash on the row was the derivative's. These columns retain the operator's
-- exact uploaded bytes and their hash alongside the working copy, so production
-- is provably based on the correct source.
--
-- Additive and nullable. Projects ingested before this have no retained
-- canonical copy; NULL states that honestly rather than backfilling a hash we
-- cannot prove.
ALTER TABLE "projects" ADD COLUMN "canonical_manuscript_path" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "canonical_manuscript_sha256" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "manuscript_sanitized" boolean;
