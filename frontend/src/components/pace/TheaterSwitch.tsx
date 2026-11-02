import { Box } from '@mui/material';

import { chipToggleSty } from '@/components/catalog/chip-styles';
import { PACE_THEATERS, PACE_THEATER_LABELS, type PaceTheater } from '@/types';

/**
 * The CONUS / OCONUS switch, on the card page and the nets library.
 *
 * Two amber-when-active chips, the control the comms library banner already
 * uses for its libraries, so a reader who has learned one has learned the
 * other. It is a single component rather than a chip row per page for the
 * reason `PageBanner` exists: two copies of one control drift.
 *
 * On the editor too, which holds one unsaved draft: there the page asks
 * before switching cards under a dirty draft, since that discards every
 * keystroke. The switch itself only reports the click.
 */
export function TheaterSwitch({
  value,
  onChange,
}: {
  value: PaceTheater;
  onChange: (next: PaceTheater) => void;
}) {
  return (
    <Box role="group" aria-label="Theater" sx={{ display: 'flex', gap: 0.75 }}>
      {PACE_THEATERS.map((theater) => (
        <button
          key={theater}
          type="button"
          aria-pressed={value === theater}
          onClick={() => {
            if (theater !== value) onChange(theater);
          }}
          style={chipToggleSty(value === theater, true)}
        >
          {PACE_THEATER_LABELS[theater]}
        </button>
      ))}
    </Box>
  );
}
