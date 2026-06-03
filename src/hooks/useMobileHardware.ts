import { useState, useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { Network } from '@capacitor/network';
import { App } from '@capacitor/app';
import { useNavigate, useLocation } from 'react-router-dom';

const ROOT_ROUTES = new Set(['/', '/home', '/login', '/onboarding']);

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

  useEffect(() => {
    if (Capacitor.getPlatform() !== 'android') return;
    const p = App.addListener('backButton', ({ canGoBack }) => {
      if (ROOT_ROUTES.has(location.pathname) || !canGoBack) App.minimizeApp();
      else navigate(-1);
    });
    return () => { p.then(h => h.remove()); };
  }, [navigate, location.pathname]);
}
