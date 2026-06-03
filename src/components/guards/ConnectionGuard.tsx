import { useNetwork } from '@/hooks/useMobileHardware';

export function ConnectionGuard({ children }: { children: React.ReactNode }) {
  const { isConnected } = useNetwork();

  return (
    <>
      {children}
      {!isConnected && (
        <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-background animate-fade-in">
          <div className="mb-6 p-5 rounded-full glass ring-1 ring-border">
            <svg className="w-12 h-12 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M3 3l18 18M10.584 10.587a2 2 0 002.828 2.83M6.343 6.346A8 8 0 0015.66 15.66M1.42 1.42A19.936 19.936 0 015.636 5.64m7.727 7.726a4 4 0 01-5.657-5.656m9.9 9.9A8 8 0 0018.364 8.364M12 21A9 9 0 0021 12M12 3a9 9 0 00-9 9" />
            </svg>
          </div>
          <h2 className="font-heading text-xl font-semibold text-foreground mb-2">No Internet Connection</h2>
          <p className="text-sm text-muted-foreground text-center max-w-[240px] leading-relaxed">
            Check your Wi-Fi or cellular connection and try again.
          </p>
          <div className="mt-8 flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
            </span>
            <span className="text-xs text-muted-foreground">Waiting for connection…</span>
          </div>
        </div>
      )}
    </>
  );
}
