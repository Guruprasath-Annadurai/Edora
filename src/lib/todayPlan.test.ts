import { describe, it, expect } from 'vitest';
import {
  validatePlanRow, validatePlanRows, filterPlanByFlags, buildFallbackPlan, planItemDestination, KIND_PATH, PLAN_KINDS, type PlanItem,
} from '@/lib/todayPlan';

const CH = '3f2b8c1e-9d4a-4c1f-8a55-0d9e6b7c1a22';
const base = { title: 'T', reason: {}, subject: null, chapter: null, topic: null };
const rows = {
  review_due: { ...base, kind: 'review_due', priority: 1, duration_minutes: 10, target_path: '/spaced-review', target_params: { due_count: 7 } },
  fix_weak:   { ...base, kind: 'fix_weak', priority: 2, duration_minutes: 15, target_path: '/practice', target_params: { mode: 'weak_topic', subject: 'Physics', subtopic: 'Torque' }, subject: 'Physics', topic: 'Torque' },
  diagnostic: { ...base, kind: 'diagnostic', priority: 3, duration_minutes: 10, target_path: '/practice', target_params: { mode: 'diagnostic', questions_count: 5 } },
  learn_next: { ...base, kind: 'learn_next', priority: 4, duration_minutes: 20, target_path: '/practice', target_params: { mode: 'learn_next', class: 11, subject: 'Physics', chapter_id: CH, chapter: 'Laws of Motion' } },
  exam_push:  { ...base, kind: 'exam_push', priority: 5, duration_minutes: 25, target_path: '/pyq-bank', target_params: { exam: 'NEET', days_remaining: 9 } },
};

describe('validatePlanRow', () => {
  it('accepts every well-formed kind', () => { for (const k of PLAN_KINDS) expect(validatePlanRow(rows[k]), k).not.toBeNull(); });
  it('rejects an unknown kind', () => expect(validatePlanRow({ ...rows.fix_weak, kind: 'buy_pro' })).toBeNull());
  it('rejects an arbitrary/unknown target_path (never becomes navigation)', () => {
    for (const p of ['/admin', 'https://evil.example', '//evil', 'javascript:alert(1)', '/pro', '/battle', '', '/practice/../admin']) {
      expect(validatePlanRow({ ...rows.fix_weak, target_path: p }), p).toBeNull();
    }
  });
  it('rejects a path that does not belong to its kind', () => {
    expect(validatePlanRow({ ...rows.fix_weak, target_path: '/pyq-bank' })).toBeNull();
    expect(validatePlanRow({ ...rows.exam_push, target_path: '/practice' })).toBeNull();
    expect(validatePlanRow({ ...rows.review_due, target_path: '/practice' })).toBeNull();
  });
  it('rejects invalid priority', () => { for (const p of [0, 6, -1, 1.5, '2', null, NaN]) expect(validatePlanRow({ ...rows.fix_weak, priority: p }), String(p)).toBeNull(); });
  it('rejects invalid / non-positive / absurd duration', () => { for (const d of [0, -5, 2.5, '10', null, 100000, NaN]) expect(validatePlanRow({ ...rows.fix_weak, duration_minutes: d }), String(d)).toBeNull(); });
  it('rejects non-object target_params', () => { for (const t of [null, [], 'x', 5, undefined]) expect(validatePlanRow({ ...rows.fix_weak, target_params: t }), String(t)).toBeNull(); });
  it('rejects unexpected structure', () => { for (const r of [null, undefined, 'row', 5, [], {}]) expect(validatePlanRow(r)).toBeNull(); });
  it('rejects empty title and non-string subject', () => {
    expect(validatePlanRow({ ...rows.fix_weak, title: '  ' })).toBeNull();
    expect(validatePlanRow({ ...rows.fix_weak, subject: 5 })).toBeNull();
    expect(validatePlanRow({ ...rows.fix_weak, reason: 'nope' })).toBeNull();
  });
});

describe('validatePlanRows', () => {
  it('keeps server order, drops bad rows, caps at 3', () => {
    const out = validatePlanRows([rows.review_due, { ...rows.fix_weak, kind: 'x' }, rows.diagnostic, rows.learn_next, rows.exam_push]);
    expect(out.map(i => i.kind)).toEqual(['review_due', 'diagnostic', 'learn_next']);
  });
  it('non-array / null payload -> []', () => { for (const p of [null, undefined, {}, 'x', 5]) expect(validatePlanRows(p)).toEqual([]); });
});

describe('filterPlanByFlags', () => {
  const items = validatePlanRows([rows.review_due, rows.exam_push]);
  it('pyq_enabled=false removes the /pyq-bank item; others stay', () => {
    expect(filterPlanByFlags(items, { novo_enabled: true, pyq_enabled: false }).map(i => i.kind)).toEqual(['review_due']);
  });
  it('pyq_enabled=true keeps everything', () => expect(filterPlanByFlags(items, { novo_enabled: true, pyq_enabled: true })).toHaveLength(2));
  it('never mutates the input', () => {
    const copy = JSON.stringify(items);
    filterPlanByFlags(items, { novo_enabled: false, pyq_enabled: false });
    expect(JSON.stringify(items)).toBe(copy);
    expect(items).toHaveLength(2);
  });
});

describe('buildFallbackPlan', () => {
  it('Practice first, Ask Novo second when Novo is enabled', () => {
    const f = buildFallbackPlan({ novo_enabled: true });
    expect(f.map(i => i.target_path)).toEqual(['/practice', '/chat']);
  });
  it('Practice ONLY when Novo is disabled', () => expect(buildFallbackPlan({ novo_enabled: false }).map(i => i.target_path)).toEqual(['/practice']));
});

describe('planItemDestination — only whitelisted, type-checked params reach navigation', () => {
  const dest = (k: keyof typeof rows) => planItemDestination(validatePlanRow(rows[k]) as PlanItem);
  it('review_due -> /spaced-review?due_count', () => expect(dest('review_due').to).toBe('/spaced-review?due_count=7'));
  it('fix_weak -> mode, subject, subtopic', () => expect(dest('fix_weak').to).toBe('/practice?mode=weak_topic&subject=Physics&subtopic=Torque'));
  it('diagnostic -> mode, questions_count', () => expect(dest('diagnostic').to).toBe('/practice?mode=diagnostic&questions_count=5'));
  it('learn_next -> mode, class, subject, chapter_id, chapter', () => expect(dest('learn_next').to).toBe(`/practice?mode=learn_next&class=11&subject=Physics&chapter_id=${CH}&chapter=Laws+of+Motion`));
  it('exam_push -> /pyq-bank?exam&days_remaining', () => expect(dest('exam_push').to).toBe('/pyq-bank?exam=NEET&days_remaining=9'));

  it('unknown / unsafe params are dropped, wrong types are dropped, injection is encoded', () => {
    const item = validatePlanRow({ ...rows.fix_weak, target_params: { mode: 'weak_topic', subject: 'Phy&x=1#frag', subtopic: 'a\nb', redirect: 'https://evil.example', __proto__: 'x', admin: true } }) as PlanItem;
    const d = planItemDestination(item);
    expect(d.pathname).toBe('/practice');
    const q = new URLSearchParams(d.search);
    expect([...q.keys()].sort()).toEqual(['mode', 'subject']);            // subtopic (control char) and extras dropped
    expect(q.get('subject')).toBe('Phy&x=1#frag');                         // value preserved as DATA, not parsed
    expect(d.to).not.toMatch(/evil|admin|redirect/);
    expect(d.to).toContain('subject=Phy%26x%3D1%23frag');
  });
  it('a wrong mode value or non-uuid chapter_id is dropped', () => {
    const d = planItemDestination(validatePlanRow({ ...rows.learn_next, target_params: { mode: 'delete_everything', class: 99, chapter_id: 'not-a-uuid', chapter: 'X' } }) as PlanItem);
    expect(d.to).toBe('/practice?chapter=X');
  });
  it('the pathname comes from the kind, never from the row', () => {
    for (const k of PLAN_KINDS) expect(dest(k).pathname).toBe(KIND_PATH[k]);
  });
  it('fallback items go to /practice and /chat with no params', () => {
    const [p, n] = buildFallbackPlan({ novo_enabled: true });
    expect(planItemDestination(p).to).toBe('/practice');
    expect(planItemDestination(n).to).toBe('/chat');
  });
  it('empty params -> bare path', () => expect(planItemDestination(validatePlanRow({ ...rows.review_due, target_params: {} }) as PlanItem).to).toBe('/spaced-review'));
});
