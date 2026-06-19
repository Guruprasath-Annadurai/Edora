export const TRIAL_DAYS = 30;

export function isInFreeTrial(createdAt: string): boolean {
  const end = new Date(createdAt);
  end.setDate(end.getDate() + TRIAL_DAYS);
  return Date.now() < end.getTime();
}

export function trialDaysRemaining(createdAt: string): number {
  const end = new Date(createdAt);
  end.setDate(end.getDate() + TRIAL_DAYS);
  return Math.max(0, Math.ceil((end.getTime() - Date.now()) / 86_400_000));
}
