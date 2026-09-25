import { assertEquals, assertNotEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import {
  isTrustedPyqCandidate,
  buildCandidateQuery,
  buildConfigKey,
  PYQ_TRUST_VERSION,
} from './index.ts';

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

Deno.test('mock-paper-composer cache trust versioning: old cache key is NOT reused', () => {
  const sections = [{ subject: 'Physics', count: 10 }];
  const oldLegacyKey = JSON.stringify({
    exam: 'JEE',
    skew: 'balanced',
    sections: sections.map(s => ({ subject: s.subject, count: s.count })),
  });

  const newTrustedKey = buildConfigKey('JEE', 'balanced', sections);

  // Must differ because new key incorporates trustVersion
  assertNotEquals(oldLegacyKey, newTrustedKey);
  assertEquals(newTrustedKey.includes(PYQ_TRUST_VERSION), true);
  assertEquals(oldLegacyKey.includes(PYQ_TRUST_VERSION), false);
});

Deno.test('mock-paper-composer cache trust versioning: new trusted cache is deterministic and reused', () => {
  const sections = [{ subject: 'Maths', count: 5 }, { subject: 'Chemistry', count: 5 }];
  const key1 = buildConfigKey('NEET', 'hard', sections);
  const key2 = buildConfigKey('NEET', 'hard', sections);

  assertEquals(key1, key2);
});

Deno.test('mock-paper-composer: unreviewed candidate can NEVER pass pool trust filter into cached paper', () => {
  const candidatePool = [
    { id: 'q1', is_active: true, is_reviewed: true, flagged_for_review: false, validation_state: 'ai_reviewed_ok' },
    { id: 'q2', is_active: true, is_reviewed: false, flagged_for_review: false, validation_state: 'unreviewed' },
    { id: 'q3', is_active: true, is_reviewed: true, flagged_for_review: true, validation_state: 'ai_flagged' },
    { id: 'q4', is_active: true, is_reviewed: true, flagged_for_review: false, validation_state: 'human_verified' },
    { id: 'q5', is_active: false, is_reviewed: true, flagged_for_review: false, validation_state: 'rejected' },
  ];

  const trustedCandidates = candidatePool.filter(isTrustedPyqCandidate);

  assertEquals(trustedCandidates.map(c => c.id), ['q1', 'q4']);
});
