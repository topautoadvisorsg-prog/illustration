/**
 * Runs once per test file, before any test in it.
 *
 * Its only job is the production-safety gate: if the environment can reach a
 * production database, API, or bucket, the run stops here with an explicit
 * explanation instead of quietly writing to production. Importing env.js
 * first ensures the same .env.example/.env.test loading the app performs has
 * already happened, so the guard inspects what tests will actually use.
 */
import './src/env.js';
import { assertNoProductionResourcesInTests } from './src/test-safety.js';

assertNoProductionResourcesInTests();
