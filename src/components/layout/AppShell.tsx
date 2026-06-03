import { Outlet } from 'react-router-dom';
import { TabBar } from './TabBar';
import { useAndroidBack } from '@/hooks/useMobileHardware';

export function AppShell() {
  useAndroidBack();

  return (
    <div className="flex flex-col h-screen bg-background overflow-hidden">
      <div style={{ height: 'env(safe-area-inset-top)', backgroundColor: '#F4F7FF', flexShrink: 0 }} />
      <main className="flex-1 overflow-hidden relative">
        <Outlet />
      </main>
      <TabBar />
    </div>
  );
}
