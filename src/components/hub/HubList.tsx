import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { useAppFlags } from '@/hooks/useAppFlags';
import { isEntryVisible } from '@/lib/routeVisibility';

export interface HubItem { to: string; title: string; desc: string }

/** A plain list of destinations. Items whose route is flagged off (or not a core V5 destination) are omitted. */
export function HubList({ items, label }: { items: HubItem[]; label: string }) {
  const flags = useAppFlags();
  const visible = items.filter(i => isEntryVisible(i.to, flags));
  if (visible.length === 0) return null;
  return (
    <ul aria-label={label} style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
      {visible.map(i => (
        <li key={i.to}>
          <Link to={i.to} style={{
            minHeight: 64, padding: '12px 16px', borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
            border: '1px solid var(--ink-140, rgba(127,127,127,0.25))', background: 'var(--ink-60, rgba(127,127,127,0.06))', color: 'var(--ink-950)',
          }}>
            <span>
              <span style={{ display: 'block', fontSize: 16, fontWeight: 700 }}>{i.title}</span>
              <span style={{ display: 'block', fontSize: 14, color: 'var(--ink-650)', marginTop: 2 }}>{i.desc}</span>
            </span>
            <ChevronRight size={20} style={{ flexShrink: 0, color: 'var(--ink-500)' }} />
          </Link>
        </li>
      ))}
    </ul>
  );
}
