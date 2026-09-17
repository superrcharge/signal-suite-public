import type { SpecRow } from '@/types';

interface SpecTableProps {
  rows?: SpecRow[];
  dense?: boolean;
  borderSide?: 'top' | 'bottom' | 'none';
}

export function SpecTable({ rows = [], dense = false, borderSide = 'top' }: SpecTableProps) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      borderTop: borderSide === 'top' ? '2px solid var(--fg-1)' : undefined,
      borderBottom: borderSide === 'bottom' ? '2px solid var(--fg-1)' : undefined,
    }}>
      {rows.map((r, i) => (
        <div key={i} style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(120px, 1fr) minmax(0, 1.4fr)',
          gap: 16,
          padding: dense ? '3px 0' : '4px 0',
          borderBottom: '1px solid var(--border-soft)',
          alignItems: 'baseline',
        }}>
          <div style={{
            fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 500,
            letterSpacing: '0.04em', textTransform: 'uppercase',
            color: 'var(--fg-3)',
          }}>{r.label}</div>
          <div style={{
            fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: 12,
            fontVariantNumeric: 'tabular-nums', color: 'var(--fg-1)',
            lineHeight: 1.3,
            wordBreak: 'break-word',
          }}>{r.value}</div>
        </div>
      ))}
    </div>
  );
}
