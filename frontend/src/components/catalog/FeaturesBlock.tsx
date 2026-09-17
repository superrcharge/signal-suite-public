import type { EquipmentFeature } from '@/types';

interface FeaturesBlockProps {
  features?: EquipmentFeature[];
}

export function FeaturesBlock({ features }: FeaturesBlockProps) {
  if (!features || features.length === 0) return null;
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
      gap: '14px 28px',
      borderTop: '2px solid var(--fg-1)',
      paddingTop: 14,
    }}>
      {features.map((f, i) => (
        <div key={i} style={{
          display: 'grid',
          gridTemplateColumns: '8px 1fr',
          gap: 12,
          alignItems: 'start',
          paddingBottom: 4,
        }}>
          <span style={{
            display: 'inline-block', width: 8, height: 8,
            background: 'var(--shf-amber)', marginTop: 7,
          }} />
          <div style={{ minWidth: 0 }}>
            <div style={{
              fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 14,
              color: 'var(--fg-1)', lineHeight: 1.3,
            }}>{f.title}</div>
            {f.description && (
              <div style={{
                fontFamily: 'var(--font-body)', fontWeight: 400, fontSize: 12.5,
                color: 'var(--fg-3)', lineHeight: 1.45, marginTop: 3,
              }}>{f.description}</div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
