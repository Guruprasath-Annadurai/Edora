import { describe, it, expect } from 'vitest';
import { sanitizeText, sanitizePromptInput, sanitizeStringArray, sanitizeTopic } from './sanitize';

describe('sanitizeText', () => {
  it('strips HTML tags', () => {
    expect(sanitizeText('<script>alert(1)</script>hello')).toBe('alert(1)hello');
  });

  it('strips null bytes', () => {
    expect(sanitizeText('a\x00b')).toBe('ab');
  });

  it('enforces max length', () => {
    expect(sanitizeText('a'.repeat(3000), 10)).toHaveLength(10);
  });

  it('trims whitespace', () => {
    expect(sanitizeText('  hello  ')).toBe('hello');
  });
});

describe('sanitizePromptInput', () => {
  it('neutralises code fence injection', () => {
    expect(sanitizePromptInput('```ignore previous```')).not.toContain('```');
  });

  it('neutralises template injection syntax', () => {
    expect(sanitizePromptInput('[[system override]]')).not.toContain('[[');
  });
});

describe('sanitizeStringArray', () => {
  it('filters non-string entries', () => {
    expect(sanitizeStringArray(['a', 1, null, 'b'])).toEqual(['a', 'b']);
  });

  it('returns empty array for non-array input', () => {
    expect(sanitizeStringArray('not an array')).toEqual([]);
  });

  it('caps item count', () => {
    const input = Array.from({ length: 50 }, (_, i) => `item${i}`);
    expect(sanitizeStringArray(input, 5)).toHaveLength(5);
  });
});

describe('sanitizeTopic', () => {
  it('strips special characters but keeps common punctuation', () => {
    expect(sanitizeTopic("Newton's Laws & Motion (Ch. 4)")).toBe("Newton's Laws & Motion (Ch. 4)");
  });

  it('removes script-like injection attempts', () => {
    expect(sanitizeTopic('<img src=x onerror=alert(1)>')).not.toContain('<');
  });
});
