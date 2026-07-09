import { CheckCircle2, Link2, Link2Off, Loader2 } from 'lucide-react';

export function ConnectBanner({
  connected, googleEmail, loading, onConnect, onDisconnect,
}: {
  connected: boolean;
  googleEmail: string | null;
  loading: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
}) {
  return (
    <div
      style={{
        background:   connected
          ? 'linear-gradient(135deg,rgba(16,185,129,0.15),rgba(5,150,105,0.1))'
          : 'linear-gradient(135deg,rgba(91,106,245,0.15),rgba(139,92,246,0.1))',
        border:       `1px solid ${connected ? 'rgba(16,185,129,0.3)' : 'rgba(91,106,245,0.3)'}`,
        borderRadius: '16px',
        padding:      '20px',
        marginBottom: '20px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, minWidth: 0 }}>
          <div
            style={{
              width:        '44px',
              height:       '44px',
              borderRadius: '12px',
              background:   connected ? 'rgba(16,185,129,0.2)' : 'rgba(91,106,245,0.2)',
              display:      'flex',
              alignItems:   'center',
              justifyContent: 'center',
              flexShrink:   0,
            }}
          >
            {connected
              ? <CheckCircle2 size={22} style={{ color: '#10B981' }} />
              : <Link2 size={22} style={{ color: '#5B6AF5' }} />}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: '14px', color: 'var(--ink-950)' }}>
              {connected ? 'Google Classroom Connected' : 'Connect Google Classroom'}
            </div>
            <div style={{ fontSize: '12px', color: 'var(--ink-500)', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {connected
                ? googleEmail
                : 'Teachers assign Edora activities directly in Classroom'}
            </div>
          </div>
        </div>

        {loading ? (
          <Loader2 size={20} style={{ color: 'var(--ink-500)', animation: 'spin 1s linear infinite', flexShrink: 0 }} />
        ) : connected ? (
          <button
            onClick={onDisconnect}
            style={{
              background:   'rgba(239,68,68,0.15)',
              border:       '1px solid rgba(239,68,68,0.3)',
              color:        '#EF4444',
              borderRadius: '10px',
              padding:      '8px 14px',
              fontSize:     '12px',
              fontWeight:   600,
              cursor:       'pointer',
              display:      'flex',
              alignItems:   'center',
              gap:          '6px',
              flexShrink:   0,
            }}
          >
            <Link2Off size={14} />
            Disconnect
          </button>
        ) : (
          <button
            onClick={onConnect}
            style={{
              background:   'linear-gradient(135deg,#5B6AF5,#8B5CF6)',
              color: 'var(--ink-950)',
              border:       'none',
              borderRadius: '10px',
              padding:      '10px 18px',
              fontSize:     '13px',
              fontWeight:   700,
              cursor:       'pointer',
              display:      'flex',
              alignItems:   'center',
              gap:          '8px',
              flexShrink:   0,
            }}
          >
            <Link2 size={15} />
            Connect
          </button>
        )}
      </div>
    </div>
  );
}
