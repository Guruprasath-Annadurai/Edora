import { useEffect } from 'react';

const WARM_VAR = '--eye-strain-active';

/**
 * After 9 PM local time, shifts the entire UI to warmer, dimmer tones
 * by toggling a CSS variable on <html>. No user interaction needed.
 * Reverts at 6 AM. Checks every 60 seconds for mid-session transitions.
 */
export function useEyeStrainMode() {
  useEffect(() => {
    function apply() {
      const h = new Date().getHours();
      const warm = h >= 21 || h < 6;
      document.documentElement.style.setProperty(WARM_VAR, warm ? '1' : '0');
    }

    apply();
    const id = setInterval(apply, 60_000);
    return () => clearInterval(id);
  }, []);
}
