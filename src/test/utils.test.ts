import { describe, it, expect } from 'vitest';

// ---- Pure utility: token helpers ----
const getTokenHeader = (token: string) => ({ Authorization: `Bearer ${token}` });
const isExpiredToken = (exp: number) => Date.now() / 1000 > exp;

describe('auth token utils', () => {
  it('formats Authorization header correctly', () => {
    const headers = getTokenHeader('abc123');
    expect(headers.Authorization).toBe('Bearer abc123');
  });

  it('detects expired token', () => {
    const pastExp = Math.floor(Date.now() / 1000) - 3600; // 1 hour ago
    expect(isExpiredToken(pastExp)).toBe(true);
  });

  it('detects valid token', () => {
    const futureExp = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now
    expect(isExpiredToken(futureExp)).toBe(false);
  });
});

// ---- Pure utility: pricing calculations ----
const calculateSavings = (baseline: number, awarded: number) =>
  Number(((baseline - awarded) / baseline * 100).toFixed(2));

describe('pricing savings calc', () => {
  it('calculates 20% savings correctly', () => {
    expect(calculateSavings(100, 80)).toBe(20);
  });

  it('returns 0 when no savings', () => {
    expect(calculateSavings(100, 100)).toBe(0);
  });

  it('handles fractional savings', () => {
    expect(calculateSavings(150, 120)).toBe(20);
  });
});

// ---- Pure utility: supplier completeness ----
const CHECKLIST = ['company_reg', 'tax_id', 'bank_details', 'certification', 'insurance', 'contact'];
const getCompleteness = (uploaded: string[]) =>
  Math.round((uploaded.filter(d => CHECKLIST.includes(d)).length / CHECKLIST.length) * 100);

describe('supplier onboarding completeness', () => {
  it('returns 100 for full upload', () => {
    expect(getCompleteness(CHECKLIST)).toBe(100);
  });

  it('returns 0 for empty upload', () => {
    expect(getCompleteness([])).toBe(0);
  });

  it('returns 50 for half docs', () => {
    expect(getCompleteness(['company_reg', 'tax_id', 'bank_details'])).toBe(50);
  });
});
