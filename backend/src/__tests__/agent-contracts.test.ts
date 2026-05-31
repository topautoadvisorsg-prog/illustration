import { describe, expect, it } from 'vitest';
import { WILDLANDS_AGENT_CONTRACTS, getAgentContract } from '../agents/agent-contracts.js';

describe('Wildlands agent contracts', () => {
  it('defines behavior contracts for every current production agent role', () => {
    expect(Object.keys(WILDLANDS_AGENT_CONTRACTS)).toEqual([
      'MANUSCRIPT_ANALYST',
      'PAGE_PLANNER',
      'LAYOUT_SELECTOR',
      'PROMPT_ASSEMBLER',
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
});
