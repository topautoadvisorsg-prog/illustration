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
    ]);
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
    expect(artBrief.hardRules.join('\n')).toContain('corner art');

    const cover = getAgentContract('COVER_ART_DIRECTOR');
    expect(cover.hardRules.join('\n')).toContain('title');
    expect(cover.hardRules.join('\n')).toContain('never baked into the generated image');
  });
});
