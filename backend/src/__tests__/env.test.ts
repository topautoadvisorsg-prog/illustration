/**
 * Unit tests for env.ts placeholder detection.
 *
 * Verifies isPlaceholder() correctly distinguishes .env.example placeholders
 * from real API keys, including edge cases.
 */

import { describe, it, expect } from 'vitest';
import { isPlaceholder } from '../env';

describe('isPlaceholder', () => {
  it('returns true for .env.example placeholder pattern', () => {
    expect(isPlaceholder('your_claude_api_key_here')).toBe(true);
    expect(isPlaceholder('your_openai_api_key_here')).toBe(true);
    expect(isPlaceholder('your_anything_at_all_here')).toBe(true);
  });

  it('returns true for placeholder pattern case-insensitively', () => {
    expect(isPlaceholder('YOUR_API_KEY_HERE')).toBe(true);
    expect(isPlaceholder('Your_Api_Key_Here')).toBe(true);
  });

  it('returns true for empty / whitespace / undefined', () => {
    expect(isPlaceholder('')).toBe(true);
    expect(isPlaceholder('   ')).toBe(true);
    expect(isPlaceholder(undefined)).toBe(true);
  });

  it('returns false for a real-looking Anthropic key', () => {
    expect(isPlaceholder('sk-ant-api03-abc123_real-token-xyz')).toBe(false);
  });

  it('returns false for a real-looking OpenAI key', () => {
    expect(isPlaceholder('sk-proj-abc123XYZ_more_chars')).toBe(false);
  });

  it('returns false for a Supabase URL', () => {
    expect(isPlaceholder('https://abcdefg.supabase.co')).toBe(false);
  });

  it('returns false for an Upstash Redis URL', () => {
    expect(isPlaceholder('rediss://default:tokenhere@us1-something.upstash.io:6379')).toBe(false);
  });

  it('returns false for a Sentry DSN', () => {
    expect(isPlaceholder('https://abc123@o12345.ingest.sentry.io/67890')).toBe(false);
  });

  // Edge case: a key that LITERALLY starts with "your_" and ends with "_here"
  // could false-positive. This is acceptable — no real API key follows this pattern.
  it('false-positives only on the strict your_*_here pattern (acceptable)', () => {
    // This would false-positive — flagging the deliberate design tradeoff.
    expect(isPlaceholder('your_company_secret_here')).toBe(true);
    // But a key that just contains "your" or "here" is fine:
    expect(isPlaceholder('keyfrom_your_account_here_xyz')).toBe(false);
    expect(isPlaceholder('your_apikey')).toBe(false);
  });
});
