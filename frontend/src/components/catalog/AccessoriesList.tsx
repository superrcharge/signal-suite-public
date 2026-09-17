import type { AccessoryItem } from '@/types';
import { EMPTY_VALUE } from '@/utils';

interface AccessoriesListProps {
  accessories?: AccessoryItem[] | string;
}

export function AccessoriesList({ accessories }: AccessoriesListProps) {
  if (!accessories || (Array.isArray(accessories) && accessories.length === 0)) {
    return (
      <div style={{
        border: '1px dashed var(--border-soft)',
        background: 'rgba(0,0,0,0.02)',
        padding: '14px 16px',
        fontFamily: 'var(--font-body)', fontSize: 13,
        color: 'var(--fg-3)', fontStyle: 'italic', lineHeight: 1.5,
      }}>
        Common pairings: downlead antennas, tactical headsets, vehicle mounts, battery packs.
        {' '}<strong style={{ color: 'var(--fg-2)', fontStyle: 'normal' }}>[ Awaiting input ]</strong>
      </div>
    );
  }

  if (typeof accessories === 'string') {
    return (
      <p style={{ fontFamily: 'var(--font-body)', fontSize: 14, lineHeight: 1.55, color: 'var(--fg-2)', margin: 0, whiteSpace: 'pre-wrap' }}>
        {accessories}
      </p>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {accessories.map((a, i) => (
        <div key={i} style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(160px, 0.9fr) minmax(0, 2fr)',
          gap: '0 16px',
          padding: '8px 0',
          borderTop: i === 0 ? '2px solid var(--fg-1)' : '1px solid var(--border-soft)',
        }}>
          <div style={{
            fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 13.5,
            color: 'var(--fg-1)', letterSpacing: '0.02em',
            textTransform: 'uppercase', lineHeight: 1.25,
          }}>{a.name || EMPTY_VALUE}</div>
          <div style={{
            fontFamily: 'var(--font-body)', fontWeight: 400, fontSize: 12.5,
            color: 'var(--fg-2)', lineHeight: 1.4,
          }}>{a.note || <span style={{ color: 'var(--fg-4)', fontStyle: 'italic' }}>No note.</span>}</div>
        </div>
      ))}
    </div>
  );
}
