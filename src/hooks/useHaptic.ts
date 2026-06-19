import { useCallback } from 'react';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';

export function useHaptic() {
  const light = useCallback(() =>
    Haptics.impact({ style: ImpactStyle.Light }).catch(() => {}), []);

  const medium = useCallback(() =>
    Haptics.impact({ style: ImpactStyle.Medium }).catch(() => {}), []);

  const heavy = useCallback(() =>
    Haptics.impact({ style: ImpactStyle.Heavy }).catch(() => {}), []);

  const success = useCallback(() =>
    Haptics.notification({ type: NotificationType.Success }).catch(() => {}), []);

  const warning = useCallback(() =>
    Haptics.notification({ type: NotificationType.Warning }).catch(() => {}), []);

  const error = useCallback(() =>
    Haptics.notification({ type: NotificationType.Error }).catch(() => {}), []);

  return { light, medium, heavy, success, warning, error };
}
