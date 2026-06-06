import { describe, expect, it } from 'vitest';
import { WILDLANDS_AGENT_CONTRACTS, getAgentContract } from '../agents/agent-contracts.js';

describe('Wildlands agent contracts', () => {
  it('defines behavior contracts for every current production agent role', () => {
    expect(Object.keys(WILDLANDS_AGENT_CONTRACTS)).toEqual([
      'MANUSCRIPT_ANALYST',
      'PAGE_PLANNER',
      'LAYOUT_SELECTOR',
      'ART_BRIEF_DIRECTOR',
      'PROMPT_ASSEMBLER',
      'COVER_ART_DIRECTOR',
      'TEXT_FIT_QA',
      'IMAGE_QA',
      'OPERATOR_ADVISER',
      'STAGE_REVIEWER',
    ]);
  });

  it('never lets any agent read image pixels (pixel rule)', () => {
    for (const contract of Object.values(WILDLANDS_AGENT_CONTRACTS)) {
      expect(contract.usesVision).toBe(false);
      expect(contract.usesTools).toBe(false);
    }
  });

  it('marks exactly the two live chat agents as advisory-llm', () => {
    const live = Object.values(WILDLANDS_AGENT_CONTRACTS)
      .filter((c) => c.runtime === 'advisory-llm')
      .map((c) => c.id);
    expect(live).toEqual(['OPERATOR_ADVISER', 'STAGE_REVIEWER']);
  });

  it('keeps Image QA metadata-only by design', () => {
    const imageQa = getAgentContract('IMAGE_QA');
    expect(imageQa.usesVision).toBe(false);
    expect(imageQa.hardRules.join('\n')).toContain('PIXEL RULE');
    expect(imageQa.requiredInputs.join('\n')).not.toContain('Generated image');
  });

  it('gives the page planner hard rules and operator-useful outputs', () => {
    const contract = getAgentContract('PAGE_PLANNER');
    expect(contract.expertFrame).toContain('field-guide');
    expect(contract.hardRules.join('\n')).toContain('word count');
    expect(contract.requiredOutputs).toContain('Layout template');
  });

  it('defines art brief and cover direction contracts for downstream image generation', () => {
    const artBrief = getAgentContract('ART_BRIEF_DIRECTOR');
    expect(artBrief.requiredOutputs.join('\n')).toContain('300-DPI pixel target');
    // Hard rules teach the new full-page-artwork zone model (text-safe zone + image-priority zone).
    expect(artBrief.hardRules.join('\n')).toContain('image-priority zone');
    expect(artBrief.hardRules.join('\n')).toContain('text-safe zone');

    const cover = getAgentContract('COVER_ART_DIRECTOR');
    expect(cover.hardRules.join('\n')).toContain('title');
    expect(cover.hardRules.join('\n')).toContain('never baked into the generated image');
  });
});
