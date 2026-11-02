import { useNavigate } from 'react-router';
import type { Equipment } from '@/types';
import { EquipmentPhoto } from './EquipmentPhoto';
import { chipSty } from './chip-styles';
import CheckIcon from '@mui/icons-material/Check';
import { CONTENT_LINE } from '@/components/common/banner-controls';

interface BrowseGridProps {
  items: Equipment[];
  /** When given, a card click selects instead of navigating to the datasheet. */
  onSelect?: (eq: Equipment) => void;
  /** Ids drawn as selected; only meaningful alongside `onSelect`. */
  selectedIds?: ReadonlySet<string>;
}

export interface TerminalCardProps {
  equipment: Equipment;
  onSelect?: (eq: Equipment) => void;
  selected?: boolean;
}

export function TerminalCard({ equipment: eq, onSelect, selected = false }: TerminalCardProps) {
  const navigate = useNavigate();
  const activate = () => {
    if (onSelect) onSelect(eq);
    else void navigate(`/catalog/${eq.id}`);
  };
  const isSatcom = eq.terminal_type !== 'radio';
  const bands = (eq.data?.bands ?? []).map(b => b.band).filter(Boolean);
  const services = (eq.data?.services ?? []).map(s => s.abbrev).filter(Boolean);
  const specs = eq.data?.standard_specs;
  const orbit = isSatcom && specs && 'orbit' in specs ? specs.orbit : undefined;
  // As a toggle the card draws a heavier, lighter border so it reads as a
  // control to press rather than a tile to open; as a link it keeps the
  // catalog's hairline. One width per mode, so selecting does not reflow.
  // Written per side rather than as `border`, because jsdom discards a
  // `border` shorthand holding a var() once `borderTop` follows it, which
  // left the rule invisible to the test that holds it.
  const restingBorder = onSelect ? '2px solid var(--shf-graphite-400)' : '1px solid var(--shf-graphite-600)';
  const selectedBorder = onSelect ? '2px solid var(--shf-amber)' : '1px solid var(--shf-amber)';
  const sides = selected ? selectedBorder : restingBorder;

  return (
    <div
      onClick={activate}
      {...(onSelect ? {
        role: 'button',
        'aria-pressed': selected,
        tabIndex: 0,
        onKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => {
          if (e.target !== e.currentTarget) return;
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            activate();
          }
        },
      } : {})}
      style={{
        background: 'var(--shf-graphite-800)',
        borderLeft: sides, borderRight: sides, borderBottom: sides,
        borderTop: '3px solid var(--shf-amber)',
        borderRadius: 0,
        cursor: 'pointer',
        display: 'flex', flexDirection: 'column',
        transition: 'border-color 120ms',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = 'var(--shf-amber)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = selected ? 'var(--shf-amber)' : onSelect ? 'var(--shf-graphite-400)' : 'var(--shf-graphite-600)';
        e.currentTarget.style.borderTopColor = 'var(--shf-amber)';
      }}
    >
      {/* Photo well */}
      <div style={{
        position: 'relative',
        height: 200,
        background: '#0A0A0A',
        overflow: 'hidden',
      }}>
        {eq.photo_url ? (
          <EquipmentPhoto equipmentId={eq.id} photoUrl={eq.photo_url} alt={eq.nomenclature} style={{
            position: 'absolute', inset: 12,
            width: 'calc(100% - 24px)', height: 'calc(100% - 24px)',
            objectFit: 'contain',
          }} />
        ) : (
          <div style={{
            position: 'absolute', inset: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--shf-graphite-400)',
            fontFamily: 'var(--font-mono)', fontSize: 10.5, letterSpacing: '0.16em',
            textTransform: 'uppercase',
            background: 'linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)',
            backgroundSize: '24px 24px',
          }}>No image</div>
        )}
        <span style={{
          position: 'absolute', top: 8, left: 8,
          padding: '2px 7px', borderRadius: 2,
          background: isSatcom ? 'var(--shf-amber)' : 'var(--shf-info)',
          color: isSatcom ? 'var(--shf-black)' : 'var(--shf-paper)',
          fontFamily: 'var(--font-mono)', fontSize: 9.5, fontWeight: 700,
          letterSpacing: '0.14em', textTransform: 'uppercase',
        }}>{isSatcom ? 'SATCOM' : 'Radio'}</span>
        {selected && onSelect && (
          <span
            data-testid="card-selected-badge"
            aria-hidden="true"
            style={{
              position: 'absolute', top: 8, right: 8, zIndex: 1,
              width: 22, height: 22, borderRadius: '50%',
              background: 'var(--shf-amber)', color: 'var(--shf-black)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <CheckIcon style={{ fontSize: 16 }} aria-hidden="true" />
          </span>
        )}
        {orbit && isSatcom && (
          <span style={{
            position: 'absolute', top: 8, right: selected && onSelect ? 38 : 8,
            padding: '2px 7px', borderRadius: 2,
            background: 'rgba(0,0,0,0.7)', color: 'var(--shf-amber)',
            fontFamily: 'var(--font-mono)', fontSize: 9.5, fontWeight: 700,
            letterSpacing: '0.14em', textTransform: 'uppercase',
            border: '1px solid var(--shf-amber)',
          }}>{orbit}</span>
        )}
      </div>

      {/* Body */}
      <div style={{ padding: 14, flex: 1, display: 'flex', flexDirection: 'column' }}>
        <div style={{
          fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 18,
          letterSpacing: '0.04em', textTransform: 'uppercase',
          color: 'var(--shf-paper)', lineHeight: 1.1,
        }}>{eq.nomenclature || 'Untitled'}</div>
        {eq.nickname && (
          <div style={{
            fontFamily: 'var(--font-condensed)', fontWeight: 500, fontSize: 12,
            letterSpacing: '0.08em', textTransform: 'uppercase',
            color: 'var(--shf-amber)', marginTop: 2,
          }}>"{eq.nickname}"</div>
        )}
        {eq.make && (
          <div style={{
            fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.12em',
            textTransform: 'uppercase', color: 'var(--shf-graphite-300)', marginTop: 6,
          }}>{eq.make}</div>
        )}
        {eq.one_liner && (
          <div style={{
            fontFamily: 'var(--font-body)', fontSize: 12.5, lineHeight: 1.45,
            color: 'var(--shf-graphite-300)', marginTop: 8, flex: 1,
            display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}>{eq.one_liner}</div>
        )}

        {/* Quick-ID chips */}
        <div style={{
          display: 'flex', flexWrap: 'wrap', gap: 4,
          marginTop: 10, paddingTop: 10,
          borderTop: '1px solid var(--shf-graphite-700)',
        }}>
          {Array.from(new Set(bands)).map(b => (
            <span key={'b-' + b} style={chipSty('amber')}>{b}</span>
          ))}
          {Array.from(new Set(services)).map(s => (
            <span key={'s-' + s} style={chipSty('paper')}>{s}</span>
          ))}
          {bands.length === 0 && services.length === 0 && (
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--shf-graphite-500)', letterSpacing: '0.08em' }}>
              No bands or services listed
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export function BrowseGrid({ items, onSelect, selectedIds }: BrowseGridProps) {
  if (items.length === 0) {
    return (
      <div style={{
        padding: 60, textAlign: 'center',
        fontFamily: 'var(--font-body)', color: 'var(--shf-graphite-300)', fontStyle: 'italic',
      }}>
        No equipment matches your filter.
      </div>
    );
  }
  return (
    <div style={{
      padding: CONTENT_LINE,
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
      gap: 18,
    }}>
      {items.map(eq => (
        <TerminalCard
          key={eq.id}
          equipment={eq}
          onSelect={onSelect}
          selected={selectedIds?.has(eq.id) ?? false}
        />
      ))}
    </div>
  );
}
