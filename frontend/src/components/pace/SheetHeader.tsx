import { Box, Typography } from '@mui/material';

import {
  SHEET_DISPLAY_FONT,
  changedProps,
  changedSty,
  dateLineSty,
  formatCardDate,
  isMarked,
} from '@/components/pace/pace-constants';

/**
 * The sheet's header: the centred title with the date and version beneath it.
 *
 * Its own component because two surfaces draw it: the sheet itself, and the
 * editor's live preview, which turned the card on its side to fit a half
 * window and had no header at all - so the title and date being typed were
 * invisible until Save. `compact` is the preview's size; nothing else differs,
 * which is what keeps the preview a preview.
 *
 * The date and the version are siblings in a flex row, never spans in one line
 * of text. The slide export emits each laid-out element as one text box in
 * that element's colour, so a red version inside a grey date line would have
 * exported grey. As flex items each is its own run, in its own colour.
 */
export function SheetHeader({
  title,
  effectiveDate,
  version,
  highlights,
  compact = false,
}: {
  title: string;
  /** YYYY-MM-DD, or empty for no date line. */
  effectiveDate: string;
  version: string;
  highlights?: readonly string[];
  compact?: boolean;
}) {
  const titleMarked = isMarked(highlights, 'title');
  const dateMarked = isMarked(highlights, 'date');
  const versionMarked = isMarked(highlights, 'version');
  const date = effectiveDate ? formatCardDate(effectiveDate) : '';
  const lineSty = compact ? { ...dateLineSty, fontSize: 9 } : dateLineSty;
  return (
    <>
      <Typography
        {...changedProps(titleMarked)}
        sx={{
          fontFamily: SHEET_DISPLAY_FONT,
          textAlign: 'center',
          fontWeight: 600,
          fontSize: compact ? 20 : 30,
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          lineHeight: 1.1,
          ...(titleMarked ? changedSty : null),
        }}
      >
        {title || 'Untitled card'}
      </Typography>
      {date || version ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', gap: 0.75, mt: 0.25 }}>
          {date && (
            <Typography
              {...changedProps(dateMarked)}
              sx={{ ...lineSty, ...(dateMarked ? changedSty : null) }}
            >
              {date}
            </Typography>
          )}
          {date && version && <Typography sx={lineSty}>·</Typography>}
          {version && (
            <Typography
              {...changedProps(versionMarked)}
              // Printed as typed: "v2" is not "V2" to the people who
              // number their revisions that way.
              sx={{ ...lineSty, textTransform: 'none', ...(versionMarked ? changedSty : null) }}
            >
              {version}
            </Typography>
          )}
        </Box>
      ) : null}
    </>
  );
}
