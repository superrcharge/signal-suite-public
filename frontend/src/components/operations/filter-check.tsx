import CheckIcon from '@mui/icons-material/Check';

/** The check on the right of a filter chip: always laid out, shown only when on, so the tile never changes width. */
export function FilterCheck({ on }: { on: boolean }) {
  return <CheckIcon aria-hidden="true" sx={{ fontSize: 14, flexShrink: 0, visibility: on ? 'visible' : 'hidden' }} />;
}
