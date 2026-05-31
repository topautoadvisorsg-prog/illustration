# Wildlands Agent Contracts

## What This Does

This folder defines backend-owned behavior contracts for the agents that run the
publishing pipeline. These contracts are not optional UI copy. They are the
operating instructions each production stage should use when deciding what to
analyze, what to output, what to block, and what to show the operator.

## Why This Exists

The Wildlands pipeline must be automated, but not opaque. The operator should
see what each agent decided and why:

- manuscript structure
- page word count
- layout selection
- typography recommendation
- prompt assembly
- text-fit status
- approval/QA status

## Agents

| Agent | Purpose |
|---|---|
| `MANUSCRIPT_ANALYST` | Parses uploaded Markdown into deterministic chapters, entries, sections, source lines, offsets, and word counts. |
| `PAGE_PLANNER` | Turns page manifests into page plans using word count, content signals, layout capacity, and brand typography. |
| `LAYOUT_SELECTOR` | Selects one of the 9 layout templates and attaches the correct mockup/prompt asset. |
| `PROMPT_ASSEMBLER` | Fills the chosen prompt template with subject/scientific/composition details for image-only generation. |
| `TEXT_FIT_QA` | Blocks pages that overflow, overlap, or violate safe type/layout ranges before image spend. |
| `IMAGE_QA` | Reviews generated art for prompt drift, subject accuracy, style consistency, and print readiness. |

## Inputs

- Project config
- Uploaded manuscript
- Page manifests
- Layout prompt assets
- Brand typography policy
- Output profile
- Generated artifacts as later stages come online

## Outputs

- Agent ID and behavior contract
- Decision reason codes
- Operator-visible warnings
- Prompt hashes
- Text-fit status
- Approval/QA status

## How To Debug

1. Check the route response first. Stage endpoints should expose agent decisions.
2. Check page rows for `layout_template`, `image_prompt`, and
   `image_prompt_sha256`.
3. Check `reasonCodes` in the Stage 2 response before blaming prompt quality.
4. If an agent makes a bad decision, update the contract or deterministic rule
   and add a fixture test.

## Research Notes

KDP print guidance requires correct trim size, bleed, margins, and safe content
placement. It does not define one universal font size for a premium illustrated
field guide. The pipeline therefore uses brand typography defaults plus
measured per-layout word capacity and text-fit approval.
