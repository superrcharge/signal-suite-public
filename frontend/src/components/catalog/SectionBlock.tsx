import type { ReactNode } from 'react';

interface SectionBlockProps {
  eyebrow?: string;
  title?: string;
  accent?: boolean;
  hideDivider?: boolean;
  children?: ReactNode;
}

export function SectionBlock({ eyebrow, title, accent = false, hideDivider = false, children }: SectionBlockProps) {
  return (
    <section style={{ marginBottom: 4 }}>
      {!hideDivider && (
        <div style={{
          height: 4, width: 48,
          background: accent ? 'var(--shf-amber)' : 'var(--fg-1)',
          marginBottom: 2,
        }} />
      )}
      {eyebrow && (
        <div style={{
          fontFamily: 'var(--font-mono)', fontSize: 10,
          letterSpacing: '0.16em', textTransform: 'uppercase',
          color: 'var(--fg-3)', marginBottom: 0,
        }}>{eyebrow}</div>
      )}
      {title && (
        <h4 style={{
          fontFamily: 'var(--font-condensed)', fontWeight: 600,
          fontSize: 20, letterSpacing: '0.06em',
          textTransform: 'uppercase', margin: '0 0 6px 0',
          color: 'var(--fg-1)',
        }}>{title}</h4>
      )}
      {children}
    </section>
  );
}

interface BulletListProps {
  items?: string[];
}

export function BulletList({ items = [] }: BulletListProps) {
  return (
    <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
      {items.map((item, i) => (
        <li key={i} style={{
          display: 'grid', gridTemplateColumns: '14px 1fr', gap: 10,
          alignItems: 'start',
          padding: '5px 0',
          fontFamily: 'var(--font-body)', fontSize: 13.5, lineHeight: 1.5,
          color: 'var(--fg-1)',
        }}>
          <span style={{
            display: 'inline-block', width: 8, height: 8,
            background: 'var(--shf-amber)', marginTop: 8,
          }} />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}
