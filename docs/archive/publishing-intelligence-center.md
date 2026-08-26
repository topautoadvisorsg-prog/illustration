# Publishing Intelligence Center

The Publishing Intelligence Center is the platform memory for production publishing work. It is not a developer log and not a temporary notes table. It captures the operational knowledge that makes later books cheaper, cleaner, and more predictable.

## Goals

- Preserve experiments, decisions, standards, SOPs, cost data, print-proof findings, and lessons learned as first-class records.
- Keep relationships visible, especially `Experiment -> Decision -> Standard -> SOP Update`.
- Store evidence with each claim so publishing choices are auditable.
- Version standards and SOPs instead of overwriting history.
- Make the system searchable and operator-visible in the frontend.

## Architecture

The module uses four layers:

1. Shared contracts in `@wildlands/shared`
   - Defines record types, statuses, scopes, evidence types, relation types, and create payloads.
   - Keeps frontend and backend aligned.

2. Database ledger in Drizzle
   - `knowledge_items` is the common searchable base table.
   - Specialist tables hold domain details: `experiments`, `decisions`, `standards`, `sops`, `print_reviews`, `cost_events`, and `lessons_learned`.
   - `standard_versions` and `sop_versions` preserve rulebook history.
   - `knowledge_evidence`, `knowledge_links`, and `knowledge_events` provide evidence, lineage, and auditability.

3. Backend service/API
   - Routes live under `/api/intelligence`.
   - Repositories own persistence.
   - Service functions own promotion workflows and relationship creation.

4. Operator UI
   - Visible as `Publishing Intelligence Center`.
   - Shows dashboard counts, recent records, quick capture forms, standards, SOPs, costs, and print-review areas.

## Data Model

Core record:

- `knowledge_items`
  - `type`: EXPERIMENT, DECISION, STANDARD, SOP, COST_RECORD, PRINT_REVIEW, LESSON
  - `status`: DRAFT, RUNNING, CONCLUDED, ACCEPTED, REJECTED, LOCKED, SUPERSEDED, ARCHIVED
  - `scope`: GLOBAL, PROJECT, BOOK, CHAPTER, PAGE, LAYOUT, WORKFLOW
  - `tags`, `metadata`, `owner_name`, timestamps

Specialist records:

- `experiments`: hypothesis, test performed, result, conclusion, dates
- `decisions`: decision, reason, accepted date, supersession pointer
- `standards`: domain, key, locked date, current version
- `standard_versions`: versioned value, rationale, effective date
- `sops`: workflow name, current version
- `sop_versions`: markdown body, checklist, change notes
- `print_reviews`: proof metadata and overall review status
- `print_findings`: margin, typography, image, KDP, paper, cover, color, binding findings
- `cost_events`: provider/model/operation/quantity/unit cost/total cost
- `lessons_learned`: lesson, prevention, applies-to areas

Relationship records:

- `knowledge_evidence`: files, URLs, screenshots, PDFs, proof photos, notes, cost reports
- `knowledge_links`: typed lineage edges
- `knowledge_events`: audit trail for creates, promotions, evidence, and links

## Workflow

1. Capture an experiment with a hypothesis, test, owner, and evidence.
2. Conclude the experiment with result and conclusion.
3. Promote the experiment to a decision when accepted.
4. Promote the decision to a locked standard when it becomes a platform rule.
5. Update the related SOP so the operator workflow changes with the rule.
6. Attach print proof photos, KDP findings, or cost reports as evidence.
7. Search old findings before repeating a test.

## Search Plan

Phase 1 uses structured filters plus title/summary text search from Postgres through Drizzle.

Phase 2 should add dedicated Postgres full-text indexes and trigram search for typo tolerance.

Phase 3 can add embeddings for semantic search if the knowledge base grows large enough to justify it.

## Implementation Rules

- Do not store publishing knowledge only in logs.
- Do not overwrite standards or SOPs; create versions.
- Every accepted standard should have a rationale and evidence link.
- Every SOP change should link back to the decision or standard that caused it.
- Cost data must preserve provider, model, operation, project/page scope, quantity, and total cost.
- Print findings must preserve severity and category so proof-copy reviews can drive standards.

## Current Phase

The first implementation provides the durable database model, shared schemas, backend API, basic promotion workflows, and visible frontend panels. Advanced search indexes and semantic search are intentionally deferred until real testing creates enough data to tune them.
