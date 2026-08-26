// Phase 5 (enterprise remediation mandate, RISK-008, Critical): mock exam
// interruption recovery. Before this, all in-progress exam state (answers,
// current question, timers) lived in plain useState with zero persistence —
// a crash, accidental navigation, low-memory tab kill, or the app being
// backgrounded and reclaimed by the OS (routine on mid-range Android)
// silently destroyed a real exam attempt with no way to recover it.
//
// Persists a snapshot to localStorage on every meaningful state change and
// offers to resume it on next mount, scoped per-user (so a shared device
// doesn't leak one student's in-progress exam into another's session) and
// time-boxed (so a genuinely abandoned attempt from days ago isn't offered
// back as if it were still live).

const STORAGE_PREFIX = 'edora_mock_exam_recovery_';
const MAX_RESUME_AGE_MS = 6 * 60 * 60 * 1000; // 6h — comfortably covers the longest real exam (NEET, 210min) plus an overnight-crash-and-reopen case, without offering to resume a genuinely stale/forgotten attempt days later.

export interface MockExamSnapshot<Section, Question> {
  attemptKey: string;
  examType: string;
  configVersion: string;
  sections: Section[];
  allQuestions: Question[];
  answers: Record<string, number | string>;
  currentIdx: number;
  sectionIdx: number;
  timeLeft: number;
  sectionTimeLeft: number;
  savedAt: string; // ISO timestamp
}

function storageKey(userId: string): string {
  return `${STORAGE_PREFIX}${userId}`;
}

export function saveMockExamSnapshot<Section, Question>(
  userId: string,
  snapshot: MockExamSnapshot<Section, Question>,
): void {
  try {
    localStorage.setItem(storageKey(userId), JSON.stringify(snapshot));
  } catch {
    // Storage full/unavailable (private browsing, quota) — recovery is a
    // best-effort safety net, not a hard requirement; never block the exam.
  }
}

export function loadMockExamSnapshot<Section, Question>(
  userId: string,
): MockExamSnapshot<Section, Question> | null {
  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (!raw) return null;
    const snapshot = JSON.parse(raw) as MockExamSnapshot<Section, Question>;
    const age = Date.now() - new Date(snapshot.savedAt).getTime();
    if (!Number.isFinite(age) || age < 0 || age > MAX_RESUME_AGE_MS) {
      clearMockExamSnapshot(userId);
      return null;
    }
    return snapshot;
  } catch {
    clearMockExamSnapshot(userId);
    return null;
  }
}

export function clearMockExamSnapshot(userId: string): void {
  try {
    localStorage.removeItem(storageKey(userId));
  } catch {
    // ignore
  }
}
