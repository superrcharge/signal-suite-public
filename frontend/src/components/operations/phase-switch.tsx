import { chipToggleSty } from '@/components/catalog/chip-styles';
import type { Phase } from '@/types';

/**
 * The phase filter above the Matrix and Web views: "All phases", then one
 * toggle chip per phase in position order, the same chips as the Loadout /
 * Matrix / Web switch in the banner. Null is every phase. With one phase or
 * none there is nothing to choose between, so it draws nothing. The Web view
 * is always about one phase, so it turns "All phases" off with `allPhases`.
 */
export function PhaseSwitch({ phases, value, onChange, allPhases = true, flush = false }: {
  phases: Phase[];
  value: string | null;
  onChange: (next: string | null) => void;
  allPhases?: boolean;
  /** No bottom margin, for a toolbar that aligns its own row (the print page). */
  flush?: boolean;
}) {
  if (phases.length <= 1) return null;
  const chip = (key: string, label: string, id: string | null) => {
    const active = value === id;
    return (
      <button
        key={key}
        type="button"
        aria-pressed={active}
        onClick={() => { if (!active) onChange(id); }}
        style={{ ...chipToggleSty(active, true), flexShrink: 0 }}
      >
        {label}
      </button>
    );
  };
  return (
    <div role="group" aria-label="Phase" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: flush ? 0 : 8 }}>
      {allPhases && chip('all', 'All phases', null)}
      {[...phases].sort((a, b) => a.position - b.position).map((p) => chip(p.id, p.name, p.id))}
    </div>
  );
}
