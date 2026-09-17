import React from 'react';
import { Box, Checkbox, FormControlLabel, Typography } from '@mui/material';

// The three export dialogs each carried a private, byte-identical copy of these.
// Moved verbatim so the extraction was reviewable as a pure deduplication.

/**
 * Row height for one option, in px.
 *
 * MUI's default lands a `size="small"` `FormControlLabel` at about 38px, almost
 * none of which is the text: the Checkbox keeps 9px of padding on all four
 * sides even at `size="small"`, and the label adds its own margins. That is the
 * whole reason the Terminals panel measured ~1,730px of content against a
 * ~750px viewport on a 1080p screen, and ~560px on a laptop - Statuses, Models
 * and Columns all rendered below the fold, which is why the model filter was
 * reported as missing when it had shipped and worked.
 *
 * 28 keeps the checkbox's own hit target at 28px square, which is still a
 * comfortable pointer target, while spending a quarter less height per row.
 * Across the 45 checkboxes on that panel it returns about 450px.
 */
export const OPTION_ROW_H = 28;

/**
 * Narrowest an option column may get before the grid drops one, per kind of
 * list - because the two kinds of list hold very different labels.
 *
 * Facet values are short: "HQ", "Mini", "A SQD", and "ALERT GREEN" is the long
 * one at about 85px of text. Columns are long: "Terminal Name" carries a
 * "required" suffix and "POP Pinned To" is not much shorter.
 *
 * One shared width served neither. At 190 the facet grids gave four ~200px
 * columns for two-character labels, which is mostly dead space; dropping to the
 * facets' number instead would wrap the column names, and a wrapped row costs
 * more height than the extra column saves.
 */
const FACET_MIN_W = 132;
const COLUMN_MIN_W = 190;

// To go back to every group on one grid, so the columns line up vertically
// down the whole panel: set FACET_MIN_W to COLUMN_MIN_W. Nothing else needs
// touching - the `wide` prop then selects between two equal numbers, and can be
// removed separately if the single width proves to be the keeper.


const optionSx = {
  m: 0,
  height: OPTION_ROW_H,
  '& .MuiCheckbox-root': { p: 0.75 },
  '& .MuiFormControlLabel-label': { fontSize: 13, lineHeight: 1.25 },
} as const;

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Box>
      <Typography
        variant="caption"
        sx={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'text.secondary', display: 'block', mb: 0.5 }}
      >
        {title}
      </Typography>
      {children}
    </Box>
  );
}

export function ChecklistGrid({
  children,
  wide = false,
}: {
  children: React.ReactNode;
  /** Set for the Columns list, whose labels are far longer than a facet's. */
  wide?: boolean;
}) {
  return (
    <Box
      sx={{
        display: 'grid',
        // `auto-fill`, not a fixed count. The old `repeat(2, 1fr)` was wrapped
        // in an `sm` breakpoint, and an MUI breakpoint keys off the *viewport*
        // rather than this container - so the grid stayed at two columns no
        // matter how wide the dialog got, which meant widening the dialog on
        // its own bought nothing. This is the idiom SectionPicker already uses.
        gridTemplateColumns: `repeat(auto-fill, minmax(${String(wide ? COLUMN_MIN_W : FACET_MIN_W)}px, 1fr))`,
        columnGap: 1.5,
        rowGap: 0,
      }}
    >
      {children}
    </Box>
  );
}

/**
 * One option. Exported so the panels stop styling checkboxes themselves and
 * the row height cannot drift between the four groups in a panel.
 */
export function ChecklistOption({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: () => void;
  label: React.ReactNode;
}) {
  return (
    <FormControlLabel
      control={<Checkbox size="small" checked={checked} onChange={onChange} />}
      label={label}
      sx={optionSx}
    />
  );
}

export function ToggleAll({ checked, indeterminate, onChange }: { checked: boolean; indeterminate: boolean; onChange: () => void }) {
  return (
    <FormControlLabel
      control={<Checkbox size="small" checked={checked} indeterminate={indeterminate} onChange={onChange} />}
      label={<Typography variant="body2" sx={{ color: 'text.secondary', fontSize: 13 }}>Select all</Typography>}
      // Same height as an option, so a group's header row does not cost more
      // than one of its own rows. There are four of these in a panel.
      sx={optionSx}
    />
  );
}
