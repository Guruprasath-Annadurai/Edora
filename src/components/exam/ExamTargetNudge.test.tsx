import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const auth = vi.hoisted(() => ({ user: { id: 'u1' }, profile: { exam_name: 'GENERAL' } as { exam_name: string | null } | null }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => auth }));
import { ExamTargetNudge } from '@/components/exam/ExamTargetNudge';

const r = () => render(<MemoryRouter><ExamTargetNudge /></MemoryRouter>);
beforeEach(() => { localStorage.clear(); auth.profile = { exam_name: 'GENERAL' }; });

describe('ExamTargetNudge (existing learners on GENERAL)', () => {
  it('offers a calm way to choose an exam, linking to /setup-exam', () => {
    r();
    expect(screen.getByRole('link', { name: /Choose exam/i })).toHaveAttribute('href', '/setup-exam');
  });
  it('treats a legacy NULL exam_name like GENERAL', () => { auth.profile = { exam_name: null }; r(); expect(screen.getByRole('link', { name: /Choose exam/i })).toBeTruthy(); });
  it('is not shown when a specific exam is set', () => { auth.profile = { exam_name: 'NEET' }; r(); expect(screen.queryByRole('link', { name: /Choose exam/i })).toBeNull(); });
  it('"Not now" dismisses it and it stays snoozed on the next visit', () => {
    const first = r();
    fireEvent.click(screen.getByRole('button', { name: /Not now/i }));
    expect(screen.queryByRole('link', { name: /Choose exam/i })).toBeNull();
    first.unmount();
    r();
    expect(screen.queryByRole('link', { name: /Choose exam/i })).toBeNull();
  });
});
