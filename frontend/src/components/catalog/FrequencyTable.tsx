import type { ReactNode } from 'react';
import type { EquipmentBand, TerminalType } from '@/types';
import { EMPTY_VALUE } from '@/utils';
import { RADIO_BAND_OPTS, SATCOM_BAND_OPTS } from './catalog-vocab';

// The editor's band options, in frequency order for the sheet. Taken from
// catalog-vocab rather than restated: the radio list here once stopped at L,
// so an S- or C-band radio module saved in the editor never reached the sheet.
const FREQUENCY_ORDER = ['HF', 'VHF', 'UHF', 'L', 'S', 'C', 'X', 'Ku', 'K', 'Ka'];
const byFrequency = (opts: string[]) =>
  [...opts].sort((a, b) => FREQUENCY_ORDER.indexOf(a) - FREQUENCY_ORDER.indexOf(b));
const SATCOM_BANDS = byFrequency(SATCOM_BAND_OPTS);
const RADIO_BANDS  = byFrequency(RADIO_BAND_OPTS);

function naCell(): ReactNode {
  return (
    <span style={{
      color: 'var(--fg-4)',
      fontFamily: 'var(--font-mono)',
      fontSize: 12,
      letterSpacing: '0.06em',
    }}>N/A</span>
  );
}

function fmtUnit(v: number | undefined, unit: string): ReactNode {
  if (v == null) return naCell();
  return (
    <span>
      {v} <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--fg-3)' }}>{unit}</span>
    </span>
  );
}

function fmt(v: string | undefined): ReactNode {
  if (v == null || v === '' || v === EMPTY_VALUE || v === 'N/A') return naCell();
  return v;
}

// Radio frequency: numeric min–max range, falling back to legacy uplink/downlink strings.
function fmtFreqRange(row: Partial<EquipmentBand>): ReactNode {
  const { freq_min, freq_max, freq_unit } = row;
  const unit = freq_unit ?? 'MHz';
  if (freq_min != null && freq_max != null) {
    return (
      <span>
        {freq_min}–{freq_max}{' '}
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--fg-3)' }}>{unit}</span>
      </span>
    );
  }
  if (freq_min != null || freq_max != null) {
    return fmtUnit(freq_min ?? freq_max, unit);
  }
  // Legacy fallback: old free-text uplink/downlink strings.
  const legacy = [row.downlink, row.uplink].filter(v => v != null && v !== '' && v !== EMPTY_VALUE && v !== 'N/A');
  if (legacy.length > 0) return legacy.join(' / ');
  return naCell();
}

function renderBand(row: Partial<EquipmentBand>): ReactNode {
  return (
    <span style={{
      fontFamily: 'var(--font-mono)', fontWeight: 600, fontSize: 11,
      letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--fg-1)',
    }}>{row.band}</span>
  );
}

function headerSty(): React.CSSProperties {
  return {
    fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 500,
    letterSpacing: '0.08em', textTransform: 'uppercase',
    color: 'var(--fg-3)',
    padding: '4px 0',
    borderBottom: '1px solid var(--border-soft)',
  };
}

function cellSty(): React.CSSProperties {
  return {
    fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: 12,
    fontVariantNumeric: 'tabular-nums',
    color: 'var(--fg-1)', lineHeight: 1.3,
    padding: '4px 0',
    borderBottom: '1px solid var(--border-soft)',
  };
}

interface ColDef {
  key: string;
  label: string;
  width: string;
  render: (row: Partial<EquipmentBand>) => ReactNode;
}

interface FrequencyTableProps {
  bands?: EquipmentBand[];
  terminalType?: TerminalType;
}

export function FrequencyTable({ bands = [], terminalType = 'satcom' }: FrequencyTableProps) {
  const canonical = terminalType === 'radio' ? RADIO_BANDS : SATCOM_BANDS;
  const isSatcom = terminalType !== 'radio';
  // One row per saved entry, in frequency order, so a radio with two S-band
  // modules shows both and a band it does not have takes no space on a
  // one-page sheet. A record with no bands at all keeps the full N/A list,
  // which says "not filled in" rather than "nothing". An entry naming a band
  // outside the list is kept, last, rather than dropped.
  const rows: Partial<EquipmentBand>[] = bands.length
    ? [
        ...canonical.flatMap(name => bands.filter(b => b.band === name)),
        ...bands.filter(b => !canonical.includes(b.band)),
      ]
    : canonical.map(name => ({ band: name }));

  const columns: ColDef[] = isSatcom
    ? [
        { key: 'band',     label: 'Band',  width: 'minmax(56px, 0.5fr)', render: renderBand                        },
        { key: 'downlink', label: 'RX',    width: '1.2fr',               render: r => fmt(r.downlink)              },
        { key: 'uplink',   label: 'TX',    width: '1.2fr',               render: r => fmt(r.uplink)                },
        { key: 'eirp',     label: 'EIRP',  width: '0.8fr',               render: r => fmtUnit(r.eirp,   'dBW')    },
        { key: 'gt',       label: 'G/T',   width: '0.8fr',               render: r => fmtUnit(r.gt,     'dB/K')   },
      ]
    : [
        { key: 'band', label: 'Band',      width: 'minmax(60px, 0.5fr)', render: renderBand    },
        { key: 'freq', label: 'Frequency', width: '2fr',                 render: fmtFreqRange  },
      ];

  const gridTemplateColumns = columns.map(c => c.width).join(' ');

  return (
    <div style={{ display: 'grid', gridTemplateColumns, borderTop: '2px solid var(--fg-1)' }}>
      {columns.map(c => (
        <div key={'h-' + c.key} style={headerSty()}>{c.label}</div>
      ))}
      {rows.map((row, i) => (
        columns.map(c => (
          <div key={c.key + '-' + i} style={cellSty()}>{c.render(row)}</div>
        ))
      ))}
    </div>
  );
}
