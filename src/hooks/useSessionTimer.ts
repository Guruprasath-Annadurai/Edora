import { useEffect, useRef, useCallback } from 'react';

export interface SessionSummary {
  durationMin: number;
  topicsVisited: string[];
  /** filled in by caller from Novo memory / quiz history */
  struggledWith?: string;
  nextSuggestion?: string;
}

const START_KEY = 'edora_session_start';
const TOPICS_KEY = 'edora_session_topics';

/** Records that the user visited a topic/route during the current session. */
export function trackTopicVisit(route: string) {
  try {
    const raw = sessionStorage.getItem(TOPICS_KEY);
    const topics: string[] = raw ? JSON.parse(raw) : [];
    if (!topics.includes(route)) topics.push(route);
    sessionStorage.setItem(TOPICS_KEY, JSON.stringify(topics));
  } catch { /* ignore */ }
}

/** Returns a function that reads the current session summary (call on app-close / unmount). */
export function useSessionTimer() {
  const startRef = useRef<number>(Date.now());

  useEffect(() => {
    const stored = sessionStorage.getItem(START_KEY);
    if (!stored) {
      sessionStorage.setItem(START_KEY, String(Date.now()));
      startRef.current = Date.now();
    } else {
      startRef.current = Number(stored);
    }
  }, []);

  const getSummary = useCallback((): SessionSummary => {
    const elapsed = Date.now() - startRef.current;
    const durationMin = Math.round(elapsed / 60_000);
    let topics: string[] = [];
    try {
      const raw = sessionStorage.getItem(TOPICS_KEY);
      topics = raw ? JSON.parse(raw) : [];
    } catch { /* ignore */ }
    return { durationMin, topicsVisited: topics };
  }, []);

  const resetSession = useCallback(() => {
    sessionStorage.removeItem(START_KEY);
    sessionStorage.removeItem(TOPICS_KEY);
    startRef.current = Date.now();
  }, []);

  return { getSummary, resetSession };
}
