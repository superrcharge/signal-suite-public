import type { ReactNode } from 'react';
import type { EquipmentSwap } from '@/types';

interface SwapBlockProps {
  swap?: EquipmentSwap;
}

function Times() {
  return <span style={{ color: 'var(--fg-3)', margin: '0 2px' }}>×</span>;
}

function Unit({ children }: { children: ReactNode }) {
  return (
    <span style={{
      fontFamily: 'var(--font-mono)', fontSize: 12,
      color: 'var(--fg-3)', letterSpacing: '0.04em', marginLeft: 2,
    }}>{children}</span>
  );
}

function NA() {
  return (
    <span style={{
      fontFamily: 'var(--font-mono)', fontSize: 12,
      letterSpacing: '0.08em', color: 'var(--fg-4, #9AA0A6)',
    }}>N/A</span>
  );
}

function fmtNum(n: number | undefined): ReactNode {
  if (n == null) return <NA />;
  return <span>{n}</span>;
}

// Weight display honors weight_unit (absent = legacy 'lbs'). `weight` is pounds,
// `weight_oz` is ounces; combined omits a zero/absent part.
function fmtWeight(s: EquipmentSwap): ReactNode {
  const mode = s.weight_unit ?? 'lbs';
  if (mode === 'oz') {
    return s.weight_oz != null ? <span>{s.weight_oz} <Unit>oz</Unit></span> : <NA />;
  }
  if (mode === 'lbs_oz') {
    const parts: ReactNode[] = [];
    if (s.weight != null && s.weight !== 0) parts.push(<span key="lbs">{s.weight} <Unit>lbs</Unit></span>);
    if (s.weight_oz != null && s.weight_oz !== 0) parts.push(<span key="oz">{s.weight_oz} <Unit>oz</Unit></span>);
    if (parts.length === 0) return <NA />;
    return <span>{parts[0]}{parts.length > 1 && <> {parts[1]}</>}</span>;
  }
  return s.weight != null ? <span>{s.weight} <Unit>lbs</Unit></span> : <NA />;
}

export function SwapBlock({ swap }: SwapBlockProps) {
  const s = swap ?? {};
  const size = s.size ?? {};
  const haveAnySize = size.length != null || size.width != null || size.height != null;

  const sizeValue: ReactNode = haveAnySize ? (
    <span>
      {fmtNum(size.length)} <Times /> {fmtNum(size.width)} <Times /> {fmtNum(size.height)} <Unit>in</Unit>
    </span>
  ) : <NA />;

  const weightValue: ReactNode = fmtWeight(s);

  const powerValue: ReactNode = s.power ? <span>{s.power}</span> : <NA />;

  const rows = [
    { label: 'Size',   value: sizeValue   },
    { label: 'Weight', value: weightValue },
    { label: 'Power',  value: powerValue  },
  ];

  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      borderBottom: '2px solid var(--fg-1)',
    }}>
      {rows.map((r, i) => (
        <div key={i} style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(120px, 1fr) minmax(0, 1.4fr)',
          gap: 16,
          padding: '4px 0',
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
          }}>{r.value}</div>
        </div>
      ))}
    </div>
  );
}
