import type { ReactNode } from 'react';

interface DataSheetProps {
  docNumber?: string;
  date?: string;
  page?: string;
  /** Show the page-boundary indicator line. */
  showPageBreak?: boolean;
  /**
   * Lift the sheet off its backdrop with a drop shadow.
   *
   * Off by default, because the two catalog pages render the sheet inside an
   * 816x1056 page box that carries its own shadow at the paper's edges. The
   * sheet's height flows with the record, so on anything short of a full page
   * its shadow fell *inside* the paper - measured on BE-900, 350px above the
   * page foot - which reads as a drop shadow across the middle of the sheet.
   *
   * The editor's Live Preview is the one place that earns it: it renders the
   * sheet straight onto a dark canvas with no page box, so the shadow is the
   * only thing separating the two.
   */
  elevated?: boolean;
  /**
   * Position (px, in article coordinates) where the page boundary line renders.
   * Defaults to 1315 when omitted. Pass `Math.round(PAGE_H / effectiveScale)`
   * from the print preview to make the line move as the scale slider changes.
   */
  pageBreakAt?: number;
  children: ReactNode;
}

export function DataSheet({ children, docNumber = '', date = '', page = '1 of 1', showPageBreak = false, pageBreakAt = 1315, elevated = false }: DataSheetProps) {
  return (
    <article style={{
      position: 'relative',
      width: 1024,
      margin: '0 auto',
      background: 'var(--shf-paper)',
      color: 'var(--fg-1)',
      boxShadow: elevated ? '0 12px 48px rgba(0,0,0,0.18)' : 'none',
      overflow: 'hidden',
    }}>
      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 1fr',
        alignItems: 'center',
        padding: '8px 22px',
        background: 'var(--shf-graphite-900)',
        color: 'var(--shf-graphite-300)',
        fontFamily: 'var(--font-mono)', fontSize: 10,
        letterSpacing: '0.14em', textTransform: 'uppercase',
        borderBottom: '2px solid var(--shf-amber)',
      }}>
        <div>{docNumber}</div>
        <div style={{ textAlign: 'right' }}>{date} · PAGE {page}</div>
      </div>

      <div style={{ position: 'relative' }}>
        {children}
      </div>

      {showPageBreak && (
        <div style={{
          position: 'absolute', top: pageBreakAt, left: 0, right: 0,
          borderTop: '2px dashed #D43A2F',
          pointerEvents: 'none', zIndex: 10,
          transition: 'top 0.15s ease',
        }}>
          <span style={{
            position: 'absolute', right: 8, top: 3,
            fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 600,
            letterSpacing: '0.1em', textTransform: 'uppercase',
            color: '#D43A2F', background: 'var(--shf-paper)',
            padding: '0 4px',
          }}>
            Page boundary
          </span>
        </div>
      )}
    </article>
  );
}
