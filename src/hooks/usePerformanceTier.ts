import { useEffect } from 'react';

/**
 * Detects low-end Android/iOS devices and stamps `html.perf-low` so CSS can
 * swap every backdrop-filter to a solid fallback — eliminating GPU blur
 * overhead that causes frame drops on budget Snapdragon 400 / Helio A22 chips.
 *
 * Detection criteria (any one → low-end):
 *   • navigator.deviceMemory < 3 GB  (Redmi A1, Samsung A03, Tecno Spark…)
 *   • navigator.hardwareConcurrency ≤ 4 cores
 *   • User agent hints at Android Go edition
 *
 * The class is set once on mount and never removed — device tier doesn't
 * change at runtime. CSS `html.perf-low *` overrides inline styles via
 * !important, so no JSX changes are needed anywhere in the app.
 */
export function usePerformanceTier(): void {
  useEffect(() => {
    const nav = navigator as Navigator & {
      deviceMemory?: number;
    };

    const memoryLow    = typeof nav.deviceMemory === 'number' && nav.deviceMemory < 3;
    const coresLow     = typeof navigator.hardwareConcurrency === 'number' && navigator.hardwareConcurrency <= 4;
    const isAndroidGo  = /Android Go|Android One/i.test(navigator.userAgent);

    if (memoryLow || coresLow || isAndroidGo) {
      document.documentElement.classList.add('perf-low');
    }
  }, []);
}
