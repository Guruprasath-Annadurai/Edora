import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDuration(seconds: number) {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0');
  const s = (seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

export function getXPForLevel(level: number) {
  return level * level * 100;
}

export function getLevelFromXP(xp: number) {
  return Math.floor(Math.sqrt(xp / 100));
}

export function truncate(str: string, n: number) {
  return str.length > n ? str.substring(0, n - 1) + '…' : str;
}

/** Race a promise against a timeout. Rejects with a user-facing message on timeout. */
export function withTimeout<T>(promise: Promise<T>, ms: number, msg = 'Request timed out. Please try again.'): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error(msg)), ms)),
  ]);
}
