import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  saveMockExamSnapshot, loadMockExamSnapshot, clearMockExamSnapshot,
  type MockExamSnapshot,
} from './mockExamRecovery';

type Snap = MockExamSnapshot<{ subject: string }, { id: string }>;

function makeSnapshot(overrides: Partial<Snap> = {}): Snap {
  return {
    attemptKey: 'key-1',
    examType: 'JEE_Main',
    configVersion: 'v1',
    sections: [{ subject: 'Physics' }],
    allQuestions: [{ id: 'q1' }, { id: 'q2' }],
    answers: { q1: 1 },
    currentIdx: 1,
    sectionIdx: 0,
    timeLeft: 5400,
    sectionTimeLeft: 0,
    savedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('mockExamRecovery', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('round-trips a saved snapshot for the same user', () => {
    const snap = makeSnapshot();
    saveMockExamSnapshot('user-1', snap);
    expect(loadMockExamSnapshot('user-1')).toEqual(snap);
  });

  it('returns null when no snapshot exists', () => {
    expect(loadMockExamSnapshot('user-1')).toBeNull();
  });

  it('scopes snapshots per user — user-2 cannot load user-1\'s in-progress attempt', () => {
    saveMockExamSnapshot('user-1', makeSnapshot());
    expect(loadMockExamSnapshot('user-2')).toBeNull();
  });

  it('clears a snapshot on explicit clear', () => {
    saveMockExamSnapshot('user-1', makeSnapshot());
    clearMockExamSnapshot('user-1');
    expect(loadMockExamSnapshot('user-1')).toBeNull();
  });

  it('discards and returns null for a snapshot older than the 6-hour resume window', () => {
    const stale = makeSnapshot({ savedAt: new Date(Date.now() - 7 * 60 * 60 * 1000).toISOString() });
    saveMockExamSnapshot('user-1', stale);
    expect(loadMockExamSnapshot('user-1')).toBeNull();
    // Also cleans up the stale entry rather than leaving it in storage forever.
    expect(localStorage.getItem('edora_mock_exam_recovery_user-1')).toBeNull();
  });

  it('accepts a snapshot saved moments ago, just inside the resume window', () => {
    const fresh = makeSnapshot({ savedAt: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString() });
    saveMockExamSnapshot('user-1', fresh);
    expect(loadMockExamSnapshot('user-1')).toEqual(fresh);
  });

  it('treats a corrupted stored value as absent rather than throwing', () => {
    localStorage.setItem('edora_mock_exam_recovery_user-1', '{not valid json');
    expect(loadMockExamSnapshot('user-1')).toBeNull();
  });

  it('never throws when localStorage.setItem fails (e.g. quota/private mode)', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('QuotaExceededError');
    });
    expect(() => saveMockExamSnapshot('user-1', makeSnapshot())).not.toThrow();
    spy.mockRestore();
  });
});
