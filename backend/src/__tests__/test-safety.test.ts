/**
 * Tests for the production-safety guard itself.
 *
 * A guard that silently stops working is worse than no guard, so these assert
 * it catches the exact credentials that were live in this repo's `.env` when
 * the leak was found — real production values, not invented shapes.
 */
import { describe, expect, it } from 'vitest';
import {
  assertNoProductionResourcesInTests,
  findProductionSafetyViolations,
  isPlaceholderValue,
  isTestDatabaseUrl,
} from '../test-safety.js';

// Shapes taken from the real production .env (values altered, formats kept).
const PROD_DB = 'postgresql://postgres.abcdefghijklmnop:s3cr3t@aws-1-us-west-2.pooler.supabase.com:6543/postgres';
const PROD_OPENAI = 'sk-proj-JCEfGLVShXHIcZcTGYPQvmc4R2fZXvlFQQlkUgL6q74cl9tdliNoWZVCesFH';
const PROD_ANTHROPIC = 'sk-ant-api03-mhMwhaQ7bzoMCVe9cwkKVImY9OlqQ2z7nGpfc34DLB0ruiZWdLa';
const PROD_SUPABASE_SERVICE = 'REDACTED__ROTATE_THIS_KEY';
const PROD_R2_ID = '41278cb15f5b2210835fe2d44162153a';

const CLEAN_ENV: NodeJS.ProcessEnv = {
  DATABASE_URL: 'your_database_url_here',
  OPENAI_API_KEY: 'your_openai_api_key_here',
  ANTHROPIC_API_KEY: 'your_claude_api_key_here',
  REPLICATE_API_TOKEN: 'your_replicate_token_here',
  SUPABASE_SERVICE_ROLE_KEY: 'your_supabase_service_role_key_here',
  R2_ACCESS_KEY_ID: 'your_r2_access_key_id_here',
  R2_SECRET_ACCESS_KEY: 'your_r2_secret_access_key_here',
};

describe('production safety guard', () => {
  it('passes on the placeholder environment shipped in .env.example', () => {
    expect(findProductionSafetyViolations(CLEAN_ENV)).toEqual([]);
    expect(() => assertNoProductionResourcesInTests(CLEAN_ENV)).not.toThrow();
  });

  it('passes when nothing is configured at all', () => {
    expect(findProductionSafetyViolations({})).toEqual([]);
  });

  it('REFUSES the production database', () => {
    const violations = findProductionSafetyViolations({ ...CLEAN_ENV, DATABASE_URL: PROD_DB });
    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain('DATABASE_URL');
  });

  it.each([
    ['OPENAI_API_KEY', PROD_OPENAI],
    ['ANTHROPIC_API_KEY', PROD_ANTHROPIC],
    ['SUPABASE_SERVICE_ROLE_KEY', PROD_SUPABASE_SERVICE],
    ['R2_ACCESS_KEY_ID', PROD_R2_ID],
  ])('REFUSES a real %s', (name, value) => {
    const violations = findProductionSafetyViolations({ ...CLEAN_ENV, [name]: value });
    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain(name);
  });

  it('reports every violation at once, not just the first', () => {
    const violations = findProductionSafetyViolations({
      ...CLEAN_ENV,
      DATABASE_URL: PROD_DB,
      OPENAI_API_KEY: PROD_OPENAI,
      R2_SECRET_ACCESS_KEY: 'afe4d30e0ee8084f7fade2fd4df21329e5affc3cd403aa2357a51ca35590835f',
    });
    expect(violations).toHaveLength(3);
  });

  it('throws an actionable error naming the offending variable and the fix', () => {
    expect(() => assertNoProductionResourcesInTests({ ...CLEAN_ENV, DATABASE_URL: PROD_DB })).toThrow(
      /PRODUCTION SAFETY VIOLATION[\s\S]*DATABASE_URL[\s\S]*\.env\.test/,
    );
  });

  describe('test-database detection', () => {
    it.each([
      'postgresql://postgres:postgres@localhost:5432/wildlands_test',
      'postgresql://postgres:postgres@127.0.0.1:5432/anything',
      'postgresql://u:p@host.docker.internal:5432/wildlands',
      'postgresql://u:p@db.internal:5432/wildlands_test',
    ])('accepts %s', (url) => {
      expect(isTestDatabaseUrl(url)).toBe(true);
    });

    it.each([
      PROD_DB,
      'postgresql://u:p@aws-1-us-west-2.pooler.supabase.com:6543/postgres',
      'postgresql://u:p@some-managed-host.example.net:5432/wildlands',
    ])('rejects %s', (url) => {
      expect(isTestDatabaseUrl(url)).toBe(false);
    });

    it('rejects an unparseable non-placeholder value rather than assuming it is safe', () => {
      expect(isTestDatabaseUrl('not a url at all')).toBe(false);
    });
  });

  describe('placeholder detection', () => {
    it('treats empty and unset as placeholder', () => {
      expect(isPlaceholderValue(undefined)).toBe(true);
      expect(isPlaceholderValue('')).toBe(true);
      expect(isPlaceholderValue('   ')).toBe(true);
    });

    it('treats real secrets as NOT placeholder', () => {
      expect(isPlaceholderValue(PROD_OPENAI)).toBe(false);
      expect(isPlaceholderValue(PROD_R2_ID)).toBe(false);
    });
  });
});
