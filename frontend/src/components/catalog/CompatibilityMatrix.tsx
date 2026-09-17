import type { EquipmentWaveform, CompatibilityComparison } from '@/types';
import { EMPTY_VALUE } from '@/utils';
import {
  matrixCell, matrixCheck, matrixHeaderCell, matrixMiss, matrixRowLabel, matrixWaveformLabel,
} from './compat-matrix-styles';

interface CompatibilityMatrixProps {
  waveforms?: EquipmentWaveform[];
  comparisons?: CompatibilityComparison[];
}

export function CompatibilityMatrix({ waveforms, comparisons }: CompatibilityMatrixProps) {
  const hasData =
    Array.isArray(waveforms) && waveforms.length > 0 &&
    Array.isArray(comparisons) && comparisons.length > 0;

  if (!hasData) {
    return (
      <div style={{
        border: '1px dashed var(--border-soft)',
        background: 'rgba(0,0,0,0.02)',
        padding: '16px 18px',
        fontFamily: 'var(--font-body)', fontSize: 13,
        color: 'var(--fg-3)', fontStyle: 'italic', lineHeight: 1.5,
      }}>
        Cross-reference with other radios in the inventory. Define waveforms and comparison radios to populate.
        {' '}<strong style={{ color: 'var(--fg-2)', fontStyle: 'normal' }}>[ Awaiting input ]</strong>
      </div>
    );
  }

  const cols = comparisons.length;
  return (
    <div style={{ overflow: 'hidden' }}>
      <div style={{
        display: 'grid',
        gridTemplateColumns: `minmax(160px, 1.4fr) repeat(${cols}, minmax(0, 1fr))`,
        borderTop: '2px solid var(--fg-1)',
      }}>
        <div style={matrixHeaderCell(true)}>Waveform</div>
        {comparisons.map((c, i) => (
          <div key={'h' + i} style={matrixHeaderCell(false)}>{c.nomenclature || c.nickname || EMPTY_VALUE}</div>
        ))}

        {waveforms.map((wf, r) => {
          const wfKey = (wf.abbrev || wf.name || '').trim();
          const isLast = r === waveforms.length - 1;
          return [
            <div key={'r' + r} style={matrixRowLabel(isLast)}>
              <div style={matrixWaveformLabel}>{wf.abbrev || wf.name}</div>
            </div>,
            ...comparisons.map((c, i) => {
              const supports = (c.waveforms ?? []).some(
                w => w && w.toLowerCase().trim() === wfKey.toLowerCase()
              );
              return (
                <div key={'c' + r + '-' + i} style={matrixCell(isLast)}>
                  {supports ? (
                    <span style={matrixCheck}>✓</span>
                  ) : (
                    <span style={matrixMiss}>{EMPTY_VALUE}</span>
                  )}
                </div>
              );
            }),
          ];
        })}
      </div>
    </div>
  );
}
