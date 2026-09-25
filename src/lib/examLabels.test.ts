import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { examDisplayName } from '@/lib/examTargets';

function walk(d: string): string[] {
  return readdirSync(d).flatMap(n => { const p = join(d, n); return statSync(p).isDirectory() ? walk(p) : /\.tsx?$/.test(n) && !/\.test\./.test(n) ? [p] : []; });
}

describe('GENERAL renders as "General study" everywhere a learner sees their exam', () => {
  it('canonical helper: NULL / undefined / blank / GENERAL', () => {
    for (const v of [null, undefined, '', '   ', 'GENERAL', 'general']) expect(examDisplayName(v as string | null | undefined)).toBe('General study');
    expect(examDisplayName('NEET')).toBe('NEET');
  });

  it('no student-facing fallback strings for the learner\'s target ("Your Exam", "Exam", "JEE") remain', () => {
    const bad = /exam_name\s*\?\?\s*['"](Your Exam|Exam|JEE)['"]/;
    const offenders = walk('src').filter(f => bad.test(readFileSync(f, 'utf8')) || /\?\?\s*'Your Exam'/.test(readFileSync(f, 'utf8')));
    expect(offenders).toEqual([]);
  });

  it('Home, Chat empty state, Revision planner, Sleep review, War room and Mock postmortem use the canonical helper', () => {
    for (const f of ['HomePage', 'ChatPage', 'RevisionPlannerPage', 'SleepReviewPage', 'ExamWarRoomPage', 'MockPostmortemPage']) {
      expect(readFileSync(`src/pages/${f}.tsx`, 'utf8'), f).toMatch(/examDisplayName\(/);
    }
  });

  it('Home\'s exam hero card gets the resolved label, not a raw/NULL value', () => {
    const home = readFileSync('src/pages/HomePage.tsx', 'utf8');
    expect(home).toMatch(/<ExamCountdownHeroCard examName=\{examDisplayName\(profile\.exam_name\)\}/);
    expect(home).toMatch(/<WarRoomBanner examName=\{examDisplayName\(profile\.exam_name\)\}/);
  });
});
