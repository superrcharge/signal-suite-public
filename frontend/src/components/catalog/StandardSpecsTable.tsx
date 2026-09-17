import type { ReactNode } from 'react';
import type { SATCOMStandardSpecs, RadioStandardSpecs, TerminalType } from '@/types';

type FieldFormat = 'string' | 'watts' | 'mph' | 'range' | 'bool' | 'list';

interface FieldDef {
  key: string;
  label: string;
  format: FieldFormat;
}

const SATCOM_STANDARD_SPECS: FieldDef[] = [
  { key: 'antennaType',      label: 'Antenna Type',       format: 'string' },
  { key: 'reflector',        label: 'Reflector',          format: 'string' },
  { key: 'modem',            label: 'Modem',              format: 'string' },
  { key: 'orbit',            label: 'Orbit',              format: 'string' },
  { key: 'bucTransmitPower', label: 'BUC TX Power', format: 'watts'  },
  { key: 'windTolerance',    label: 'Wind Tolerance',     format: 'mph'    },
  { key: 'altPntAvailable',  label: 'ALT-PNT Available',  format: 'bool'   },
];

const RADIO_STANDARD_SPECS: FieldDef[] = [
  { key: 'antennaType',   label: 'Antenna Type',   format: 'string' },
  { key: 'transmitPower', label: 'TX Power', format: 'watts'  },
  { key: 'crypto',        label: 'Crypto',         format: 'string' },
  { key: 'range',         label: 'Range',          format: 'range'  },
];

function naCell() {
  return (
    <span style={{
      fontFamily: 'var(--font-mono)', fontSize: 12,
      letterSpacing: '0.08em', color: 'var(--fg-4, #9AA0A6)',
    }}>N/A</span>
  );
}

function unitSpan(text: string) {
  return <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--fg-3)' }}>{text}</span>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function formatStandardValue(raw: any, format: FieldFormat, specs?: Record<string, unknown>): ReactNode {
  if (raw == null || raw === '' || (Array.isArray(raw) && raw.length === 0)) return naCell();
  if (format === 'watts') return <span>{raw} {unitSpan('W')}</span>;
  if (format === 'mph')   return <span>{raw} {unitSpan('mph')}</span>;
  if (format === 'range') return <span>{raw} {unitSpan((specs?.range_unit as string) ?? 'mi')}</span>;
  if (format === 'bool')  return raw === true ? 'Yes' : raw === false ? 'No' : String(raw);
  if (format === 'list')  return (raw as string[]).join(' · ');
  return String(raw);
}

interface StandardSpecsTableProps {
  standardSpecs?: SATCOMStandardSpecs | RadioStandardSpecs;
  terminalType?: TerminalType;
}

export function StandardSpecsTable({ standardSpecs = {}, terminalType = 'satcom' }: StandardSpecsTableProps) {
  const fields = terminalType === 'radio' ? RADIO_STANDARD_SPECS : SATCOM_STANDARD_SPECS;
  const specs = standardSpecs as Record<string, unknown>;
  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      borderTop: '2px solid var(--fg-1)',
    }}>
      {fields.map((field) => (
        <div key={field.key} style={{
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
          }}>{field.label}</div>
          <div style={{
            fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: 12,
            fontVariantNumeric: 'tabular-nums', color: 'var(--fg-1)',
            lineHeight: 1.3, wordBreak: 'break-word',
          }}>{formatStandardValue(specs[field.key], field.format, specs)}</div>
        </div>
      ))}
    </div>
  );
}
