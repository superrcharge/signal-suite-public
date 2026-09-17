import type { ReactNode } from 'react';
import type { EquipmentService, EquipmentWaveform, TerminalType } from '@/types';
import { EquipmentPhoto } from './EquipmentPhoto';
import { EMPTY_VALUE } from '@/utils';

interface HeroBlockProps {
  equipmentId?: string;
  photoUrl?: string;
  nomenclature: string;
  nickname?: string;
  oneLiner?: string;
  make?: string;
  operationalMode?: string[];
  services?: EquipmentService[];
  waveforms?: EquipmentWaveform[];
  terminalType?: TerminalType;
}

function naCellHero(): ReactNode {
  return (
    <span style={{ color: 'var(--fg-4)', fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.06em' }}>N/A</span>
  );
}

interface Rate {
  dl?: number | string;
  ul?: number | string;
}

function fmtRate(rate?: Rate): ReactNode {
  if (!rate) return naCellHero();
  const dl = rate.dl != null && rate.dl !== '' ? rate.dl : null;
  const ul = rate.ul != null && rate.ul !== '' ? rate.ul : null;
  if (dl == null && ul == null) return naCellHero();
  return (
    <span>
      {dl ?? EMPTY_VALUE}<span style={{ color: 'var(--fg-3)', margin: '0 1px' }}>/</span>{ul ?? EMPTY_VALUE}
      {' '}<span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-3)' }}>Mbps</span>
    </span>
  );
}

function bestEffortCell(): ReactNode {
  return (
    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.06em', color: 'var(--fg-3)' }}>
      Best Effort
    </span>
  );
}

function cellNumSty(): React.CSSProperties {
  return {
    padding: '8px 0 8px 0',
    borderBottom: '1px solid var(--border-soft)',
    fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 500,
    fontVariantNumeric: 'tabular-nums',
    color: 'var(--fg-1)', lineHeight: 1.3,
    textAlign: 'right',
  };
}

const RETICLE_CORNERS: Array<{ style: React.CSSProperties }> = [
  { style: { position: 'absolute', width: 16, height: 16, top: 10, left: 10, borderTop: '2px solid #F5A21F', borderLeft: '2px solid #F5A21F' } },
  { style: { position: 'absolute', width: 16, height: 16, top: 10, right: 10, borderTop: '2px solid #F5A21F', borderRight: '2px solid #F5A21F' } },
  { style: { position: 'absolute', width: 16, height: 16, bottom: 10, left: 10, borderBottom: '2px solid #F5A21F', borderLeft: '2px solid #F5A21F' } },
  { style: { position: 'absolute', width: 16, height: 16, bottom: 10, right: 10, borderBottom: '2px solid #F5A21F', borderRight: '2px solid #F5A21F' } },
];

export function HeroBlock({
  equipmentId, photoUrl, nomenclature, nickname, oneLiner,
  make, operationalMode: _operationalMode,
  services, waveforms, terminalType = 'satcom',
}: HeroBlockProps) {
  const isRadio = terminalType === 'radio';

  return (
    <div style={{ borderBottom: '2px solid var(--fg-1)' }}>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 420px) 1fr',
        gap: 0,
      }}>
        {/* PHOTO WELL */}
        <div style={{
          position: 'relative',
          minHeight: 360,
          background: '#FFFFFF',
          borderRight: '4px solid var(--shf-amber)',
          overflow: 'hidden',
          alignSelf: 'stretch',
        }}>
          <div style={{
            position: 'absolute', inset: 0,
            backgroundImage:
              'linear-gradient(rgba(0,0,0,0.04) 1px, transparent 1px),' +
              'linear-gradient(90deg, rgba(0,0,0,0.04) 1px, transparent 1px)',
            backgroundSize: '32px 32px',
          }} />

          {equipmentId ? (
            <EquipmentPhoto equipmentId={equipmentId} photoUrl={photoUrl} alt={nomenclature} style={{
              position: 'absolute',
              top: 24, left: 24, right: 24, bottom: 24,
              width: 'calc(100% - 48px)', height: 'calc(100% - 48px)',
              objectFit: 'contain', objectPosition: 'center center',
            }} />
          ) : (
            <div style={{
              position: 'absolute', inset: 24,
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center',
              gap: 14,
              border: '1.5px dashed rgba(245,162,31,0.45)',
              background: 'rgba(245,162,31,0.03)',
              color: '#9AA0A6',
              textAlign: 'center',
              padding: '20px 24px',
            }}>
              <svg width="44" height="44" viewBox="0 0 44 44" fill="none" aria-hidden="true">
                <rect x="3" y="3" width="38" height="38" stroke="rgba(245,162,31,0.55)" strokeWidth="1.5" />
                <path d="M22 30 V14 M14 22 L22 14 L30 22" stroke="#F5A21F" strokeWidth="2" strokeLinecap="square" strokeLinejoin="miter" fill="none" />
              </svg>
              <div style={{
                fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 13,
                letterSpacing: '0.18em', textTransform: 'uppercase',
                color: 'var(--shf-amber)',
              }}>Insert Equipment Photo</div>
            </div>
          )}

          {RETICLE_CORNERS.map((p, i) => (
            <div key={i} style={p.style} />
          ))}
        </div>

        {/* IDENTIFICATION BLOCK */}
        <div style={{ padding: '12px 28px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ minWidth: 0, flex: 1 }}>
              {make && (
                <div style={{
                  fontFamily: 'var(--font-mono)', fontSize: 11,
                  letterSpacing: '0.16em', textTransform: 'uppercase',
                  color: 'var(--fg-3)', marginBottom: 6,
                }}>{make}</div>
              )}
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
                <h1 style={{
                  fontFamily: 'var(--font-display)', fontWeight: 700,
                  fontSize: 38, lineHeight: 1, letterSpacing: '-0.005em',
                  textTransform: 'uppercase', margin: 0, color: 'var(--fg-1)',
                }}>{nomenclature}</h1>
                {nickname && (
                  <div style={{
                    fontFamily: 'var(--font-condensed)', fontWeight: 500,
                    fontSize: 15, letterSpacing: '0.08em', textTransform: 'uppercase',
                    color: 'var(--shf-amber-deep)', flexShrink: 0,
                  }}>"{nickname}"</div>
                )}
              </div>
              {oneLiner && (
                <div style={{
                  fontFamily: 'var(--font-body)', fontStyle: 'italic',
                  fontSize: 13, lineHeight: 1.4,
                  color: 'var(--fg-2)', marginTop: 5,
                }}>{oneLiner}</div>
              )}
            </div>
          </div>

          {/* Radio → Waveforms table */}
          {isRadio && waveforms && waveforms.length > 0 && (
            <div style={{ paddingTop: 4, marginTop: 2 }}>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'minmax(56px, 0.5fr) minmax(0, 1.7fr)',
                borderTop: '2px solid var(--fg-1)',
              }}>
                {['Waveform', 'Description'].map((h, i) => (
                  <div key={'h' + i} style={{
                    fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 500,
                    letterSpacing: '0.08em', textTransform: 'uppercase',
                    color: 'var(--fg-3)',
                    padding: '6px 8px 6px 0',
                    borderBottom: '1px solid var(--border-soft)',
                    textAlign: 'left',
                  }}>{h}</div>
                ))}
                {waveforms.map((wf, i) => (
                  [
                    <div key={'wa' + i} style={{
                      padding: '8px 8px 8px 0',
                      borderBottom: '1px solid var(--border-soft)',
                      fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 15,
                      letterSpacing: '0.04em', color: 'var(--shf-amber-deep)',
                      textTransform: 'uppercase', lineHeight: 1.2,
                    }}>{wf.abbrev || wf.name}</div>,
                    <div key={'wb' + i} style={{
                      padding: '8px 8px 8px 0',
                      borderBottom: '1px solid var(--border-soft)',
                      minWidth: 0,
                    }}>
                      {wf.abbrev && wf.name && wf.name !== wf.abbrev && (
                        <div style={{
                          fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 12.5,
                          color: 'var(--fg-1)', lineHeight: 1.25,
                        }}>{wf.name}</div>
                      )}
                      {wf.description && (
                        <div style={{
                          fontFamily: 'var(--font-body)', fontWeight: 400, fontSize: 11.5,
                          color: 'var(--fg-3)', lineHeight: 1.35, marginTop: 2,
                        }}>{wf.description}</div>
                      )}
                    </div>,
                  ]
                ))}
              </div>
            </div>
          )}

          {/* SATCOM → Services table */}
          {!isRadio && services && services.length > 0 && (
            <div style={{ paddingTop: 4, marginTop: 2 }}>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'minmax(56px, 0.5fr) minmax(0, 1.7fr) minmax(64px, 0.7fr) minmax(64px, 0.7fr)',
                borderTop: '2px solid var(--fg-1)',
              }}>
                {['Service', 'Description', 'CIR', 'MIR'].map((h, i) => (
                  <div key={'h' + i} style={{
                    fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 500,
                    letterSpacing: '0.08em', textTransform: 'uppercase',
                    color: 'var(--fg-3)',
                    padding: '6px 8px 6px 0',
                    borderBottom: '1px solid var(--border-soft)',
                    textAlign: i >= 2 ? 'right' : 'left',
                  }}>{h}</div>
                ))}
                {services.map((svc, i) => (
                  [
                    <div key={'sa' + i} style={{
                      padding: '8px 8px 8px 0',
                      borderBottom: '1px solid var(--border-soft)',
                      fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 15,
                      letterSpacing: '0.04em', color: 'var(--shf-amber-deep)',
                      textTransform: 'uppercase', lineHeight: 1.2,
                    }}>{svc.abbrev}</div>,
                    <div key={'sb' + i} style={{
                      padding: '8px 8px 8px 0',
                      borderBottom: '1px solid var(--border-soft)',
                      minWidth: 0,
                    }}>
                      <div style={{
                        fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 12.5,
                        color: 'var(--fg-1)', lineHeight: 1.25,
                      }}>{svc.name}</div>
                      {svc.description && (
                        <div style={{
                          fontFamily: 'var(--font-body)', fontWeight: 400, fontSize: 11.5,
                          color: 'var(--fg-3)', lineHeight: 1.35, marginTop: 2,
                        }}>{svc.description}</div>
                      )}
                    </div>,
                    <div key={'sc' + i} style={cellNumSty()}>{svc.best_effort ? bestEffortCell() : fmtRate(svc.cir)}</div>,
                    <div key={'sd' + i} style={cellNumSty()}>{svc.best_effort ? bestEffortCell() : fmtRate(svc.mir)}</div>,
                  ]
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
