/**
 * HARD MODEL GUARD — resolve the review model the way vision-core does, and
 * make no provider call whatsoever. Exits non-zero unless it is the approved
 * model, so it can gate a paid run.
 */
import { getEnv, isPlaceholder } from '../src/env.js';
const APPROVED = 'gpt-4.1-mini';
const env = getEnv();
const model = env.OPENAI_REVIEW_MODEL;
const keyOk = !!env.OPENAI_API_KEY && !isPlaceholder(env.OPENAI_API_KEY);
console.log('MODEL GUARD');
console.log(`  resolved OPENAI_REVIEW_MODEL : ${model === undefined ? '(undefined)' : `"${model}"`}`);
console.log(`  approved                      : "${APPROVED}"`);
console.log(`  api key present & real        : ${keyOk}`);
if (model !== APPROVED) {
  console.error(`\n  ABORT — resolved model is not the approved one. No paid call made.`);
  process.exit(2);
}
console.log('\n  MATCH — safe to proceed with the paid run.');
process.exit(0);
