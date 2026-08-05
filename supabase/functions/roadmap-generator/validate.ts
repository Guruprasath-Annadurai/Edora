// Pure validation logic (and its supporting types) extracted out of index.ts
// so it can be unit tested without triggering index.ts's top-level serve()
// call.

export interface RoadmapDay {
  day: number;
  subject: string;
  topic: string;
  description: string;
  duration_minutes: number;
}
export interface RoadmapWeek {
  week_number: number;
  theme: string;
  days: RoadmapDay[];
}
export interface GeminiRoadmap {
  plan_summary: string;
  subjects: string[];
  weeks: RoadmapWeek[];
}

// ── Per-day / per-week structural validator ───────────────────────────────────
export function validateDay(day: Partial<RoadmapDay>, ctx: string): string | null {
  if (typeof day.day !== 'number') return `${ctx}: missing "day" number`;
  if (!day.subject || typeof day.subject !== 'string') return `${ctx}: missing "subject"`;
  if (!day.topic || typeof day.topic !== 'string') return `${ctx}: missing "topic"`;
  if (!day.description || typeof day.description !== 'string') return `${ctx}: missing "description"`;
  if (typeof day.duration_minutes !== 'number' || day.duration_minutes <= 0) {
    return `${ctx}: "duration_minutes" must be a positive number`;
  }
  return null;
}

export function validateWeeks(weeks: RoadmapWeek[] | undefined, expectedWeeks: number, daysPerWeek: number): string | null {
  if (!Array.isArray(weeks) || weeks.length === 0) return '"weeks" must be a non-empty array';
  if (weeks.length < expectedWeeks) return `expected at least ${expectedWeeks} weeks, got ${weeks.length}`;
  for (let i = 0; i < weeks.length; i++) {
    const w = weeks[i];
    if (typeof w.week_number !== 'number') return `weeks[${i}]: missing "week_number"`;
    if (!Array.isArray(w.days) || w.days.length === 0) return `weeks[${i}]: "days" must be a non-empty array`;
    if (w.days.length < daysPerWeek) return `weeks[${i}]: expected ${daysPerWeek} days, got ${w.days.length}`;
    for (let j = 0; j < w.days.length; j++) {
      const err = validateDay(w.days[j], `weeks[${i}].days[${j}]`);
      if (err) return err;
    }
  }
  return null;
}
