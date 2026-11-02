import Check from '@mui/icons-material/Check';
import Close from '@mui/icons-material/Close';
import Replay from '@mui/icons-material/Replay';

export type StatusKind = 'direct' | 'relay' | 'cannot' | 'absent';

/**
 * A requirement's status as an icon, on every HTML surface (the Loadout By phase
 * table, the Web key, the wizard's Must talk slot).
 *
 * An icon and not the text glyph because the app's mono and body fonts have no
 * check mark: the browser substitutes a thin fallback that reads as a "v".
 * The slot is fixed-width (size + 2) and always present, so a status appearing
 * or changing never moves its neighbours.
 * The SVG picture's pills and the PowerPoint decks keep `PAIR_GLYPH`, because
 * their text is measured in characters and an icon cannot be.
 */
export function StatusIcon({ kind, color, label, size = 14 }: {
  kind: StatusKind;
  color: string;
  label?: string;
  size?: number;
}) {
  const icon = { fontSize: size, display: 'block' } as const;
  return (
    <span
      role="img"
      aria-label={label}
      aria-hidden={label ? undefined : true}
      data-status={kind}
      style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: size + 2, height: size, color, flexShrink: 0 }}
    >
      {kind === 'direct' && <Check sx={icon} />}
      {kind === 'relay' && <Replay sx={icon} />}
      {kind === 'cannot' && <Close sx={icon} />}
      {kind === 'absent' && (
        <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3" fill="currentColor" /></svg>
      )}
    </span>
  );
}
