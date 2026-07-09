import { ChevronRight } from 'lucide-react';

export function ReportCard({
  icon: Icon, title, subtitle, color, onClick,
}: {
  icon: React.ComponentType<{size?: number | string; style?: React.CSSProperties}>; title: string; subtitle: string; color: string; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        width:          '100%',
        background:     'var(--hdr-b-750)',
        border:         '1px solid var(--ink-070)',
        borderRadius:   '16px',
        padding:        '16px',
        cursor:         'pointer',
        display:        'flex',
        alignItems:     'center',
        gap:            '14px',
        marginBottom:   '12px',
        textAlign:      'left',
      }}
    >
      <div
        style={{
          width:          '44px',
          height:         '44px',
          borderRadius:   '12px',
          background:     `${color}20`,
          border:         `1px solid ${color}40`,
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'center',
          flexShrink:     0,
        }}
      >
        <Icon size={22} style={{ color }} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--ink-950)', marginBottom: '2px' }}>{title}</div>
        <div style={{ fontSize: '12px', color: 'var(--ink-500)', lineHeight: 1.5 }}>{subtitle}</div>
      </div>
      <ChevronRight size={18} style={{ color: 'var(--ink-500)', flexShrink: 0 }} />
    </button>
  );
}
