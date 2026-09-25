import { describe, it, expect } from 'vitest';
import { EXAM_TARGETS, GENERAL_EXAM, resolveExamName, isGeneralExam, examDisplayName, normaliseExamDate } from '@/lib/examTargets';

describe('exam target list (founder decision D-6)', () => {
  it('is exactly the approved list, ending with Not sure yet -> GENERAL', () => {
    expect(EXAM_TARGETS.map(e => e.value)).toEqual(['JEE Main', 'JEE Advanced', 'NEET', 'CBSE 10', 'CBSE 12', 'UPSC', 'CAT', 'GENERAL']);
    expect(EXAM_TARGETS.at(-1)?.hasDate).toBe(false);
  });
});

describe('resolveExamName — never null', () => {
  it.each([[null], [undefined], [''], ['   ']])('%j -> GENERAL', v => expect(resolveExamName(v as string | null | undefined)).toBe(GENERAL_EXAM));
  it('keeps approved values and normalises case', () => {
    expect(resolveExamName('NEET')).toBe('NEET');
    expect(resolveExamName('jee main')).toBe('JEE Main');
    expect(resolveExamName('general')).toBe('GENERAL');
  });
  it('maps legacy onboarding values', () => {
    expect(resolveExamName('NEET UG')).toBe('NEET');
    expect(resolveExamName('CBSE')).toBe('CBSE 12');
    expect(resolveExamName('Other')).toBe('GENERAL');
    expect(resolveExamName('JEE_MAIN')).toBe('JEE Main');
  });
  it('keeps an unknown custom target rather than discarding it', () => {
    expect(resolveExamName('GATE CSE')).toBe('GATE CSE');
  });
});

describe('GENERAL helpers', () => {
  it('isGeneralExam / display name', () => {
    expect(isGeneralExam(null)).toBe(true);
    expect(isGeneralExam('GENERAL')).toBe(true);
    expect(isGeneralExam('NEET')).toBe(false);
    expect(examDisplayName(null)).toBe('General study');
    expect(examDisplayName('CBSE 10')).toBe('CBSE Class 10');
  });
});

describe('normaliseExamDate', () => {
  const today = new Date('2026-10-01T10:00:00');
  it('drops the date for GENERAL, invalid input and past dates; keeps a valid future date', () => {
    expect(normaliseExamDate('GENERAL', '2027-01-01', today)).toBeNull();
    expect(normaliseExamDate('NEET', '', today)).toBeNull();
    expect(normaliseExamDate('NEET', 'not-a-date', today)).toBeNull();
    expect(normaliseExamDate('NEET', '2026-09-30', today)).toBeNull();
    expect(normaliseExamDate('NEET', '2026-10-01', today)).toBe('2026-10-01');
    expect(normaliseExamDate('NEET', '2027-05-03', today)).toBe('2027-05-03');
  });
});
