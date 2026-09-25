import { assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { isTrustedPyqCandidate, buildCandidateQuery } from './index.ts';

Deno.test('mock-paper-composer candidate selection: unreviewed questions excluded', () => {
  const row = {
    is_active: true,
    flagged_for_review: false,
    is_reviewed: false, // unreviewed
    validation_state: 'unreviewed',
  };
  assertEquals(isTrustedPyqCandidate(row), false);
});

Deno.test('mock-paper-composer candidate selection: flagged questions excluded', () => {
  const row = {
    is_active: true,
    flagged_for_review: true, // flagged
    is_reviewed: true,
    validation_state: 'ai_flagged',
  };
  assertEquals(isTrustedPyqCandidate(row), false);
});

Deno.test('mock-paper-composer candidate selection: rejected/inactive questions excluded', () => {
  const inactiveRow = {
    is_active: false, // inactive
    flagged_for_review: false,
    is_reviewed: true,
    validation_state: 'rejected',
  };
  assertEquals(isTrustedPyqCandidate(inactiveRow), false);

  const rejectedRow = {
    is_active: true,
    flagged_for_review: false,
    is_reviewed: true,
    validation_state: 'rejected', // rejected
  };
  assertEquals(isTrustedPyqCandidate(rejectedRow), false);
});

Deno.test('mock-paper-composer candidate selection: ai_reviewed_ok + reviewed included', () => {
  const row = {
    is_active: true,
    flagged_for_review: false,
    is_reviewed: true,
    validation_state: 'ai_reviewed_ok',
  };
  assertEquals(isTrustedPyqCandidate(row), true);
});

Deno.test('mock-paper-composer candidate selection: human_verified + reviewed included', () => {
  const row = {
    is_active: true,
    flagged_for_review: false,
    is_reviewed: true,
    validation_state: 'human_verified',
  };
  assertEquals(isTrustedPyqCandidate(row), true);
});

Deno.test('mock-paper-composer buildCandidateQuery applies strict filter chain', () => {
  const calls: { method: string; args: unknown[] }[] = [];

  const mockQuery: any = {
    select: (...args: unknown[]) => { calls.push({ method: 'select', args }); return mockQuery; },
    eq: (...args: unknown[]) => { calls.push({ method: 'eq', args }); return mockQuery; },
    in: (...args: unknown[]) => { calls.push({ method: 'in', args }); return mockQuery; },
    limit: (...args: unknown[]) => { calls.push({ method: 'limit', args }); return mockQuery; },
  };

  const mockSupabase = {
    from: (table: string) => {
      calls.push({ method: 'from', args: [table] });
      return mockQuery;
    },
  };

  buildCandidateQuery(mockSupabase, 'JEE', 'Physics', 40);

  assertEquals(calls[0], { method: 'from', args: ['pyq_content'] });
  assertEquals(calls[1], { method: 'select', args: ['id, chapter, difficulty, question_type, marks'] });
  assertEquals(calls[2], { method: 'eq', args: ['exam', 'JEE'] });
  assertEquals(calls[3], { method: 'eq', args: ['subject', 'Physics'] });
  assertEquals(calls[4], { method: 'eq', args: ['is_active', true] });
  assertEquals(calls[5], { method: 'eq', args: ['flagged_for_review', false] });
  assertEquals(calls[6], { method: 'eq', args: ['is_reviewed', true] });
  assertEquals(calls[7], { method: 'in', args: ['validation_state', ['ai_reviewed_ok', 'human_verified']] });
  assertEquals(calls[8], { method: 'limit', args: [40] });
});
