import { useState, useEffect, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { Network } from '@capacitor/network';
import { App } from '@capacitor/app';
import { useNavigate, useLocation } from 'react-router-dom';

import { handleBack, decideBackAction } from '@/lib/backStack';

export function useMobileHardware() {
  const platform = Capacitor.getPlatform() as 'ios' | 'android' | 'web';
  const isNative = Capacitor.isNativePlatform();

  return { platform, isNative, isIOS: platform === 'ios', isAndroid: platform === 'android', isWeb: platform === 'web' };
}

export function useNetwork() {
  const [isConnected, setIsConnected] = useState(true);

  useEffect(() => {
    Network.getStatus().then(s => setIsConnected(s.connected));
    const p = Network.addListener('networkStatusChange', s => setIsConnected(s.connected));
    return () => { p.then(h => h.remove()); };
  }, []);

  return { isConnected };
}

export function useAndroidBack() {
  const navigate = useNavigate();
  const location = useLocation();
  const pathRef = useRef(location.pathname);
  pathRef.current = location.pathname;

  // One listener for the whole app (registered once, reads the live path via a ref, so it can never
  // double-fire or be missed during a route change).
  useEffect(() => {
    if (Capacitor.getPlatform() !== 'android') return;
    const p = App.addListener('backButton', ({ canGoBack }) => {
      if (handleBack()) return;                                   // an overlay/step consumed it
      const historyIdx = (window.history.state as { idx?: number } | null)?.idx ?? 1;
      const action = decideBackAction(pathRef.current, canGoBack && historyIdx > 0);
      if (action === 'minimise') void App.minimizeApp();
      else if (action === 'home') navigate('/home', { replace: true });
      else navigate(-1);
    });
    return () => { void p.then(h => h.remove()); };
  }, [navigate]);
}
