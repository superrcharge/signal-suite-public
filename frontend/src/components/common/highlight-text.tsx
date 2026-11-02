import { Fragment } from 'react';
import { Box } from '@mui/material';
import { alpha, type SxProps, type Theme } from '@mui/material/styles';

import { splitOnTerm, splitOnTerms } from './split-on-term';

/**
 * The wash behind a hit. Amber from the palette, never the hex, so it follows
 * light and dark mode and `check-ui-tokens.mjs` stays quiet. `color: inherit`
 * is load-bearing: the UA stylesheet gives `mark` black on yellow, which on the
 * dark shell is a highlighter pen through a slide.
 */
const MARK_SX: SxProps<Theme> = {
  bgcolor: (t) => alpha(t.palette.primary.main, 0.32),
  color: 'inherit',
  px: 0,
  borderRadius: '2px',
};

type HighlightTextProps = { text: string } & (
  | {
      /** The search phrase that produced the row this text is on. Empty marks nothing. */
      term: string;
      terms?: undefined;
    }
  | {
      term?: undefined;
      /** The search words, each marked where it begins a word. Empty marks nothing. */
      terms: string[];
    }
);

/**
 * `text` with every hit wrapped in a `<mark>`: the whole phrase for `term`,
 * each word for `terms`. The matching rules live in `split-on-term.ts`.
 *
 * With no hit it renders the string itself, so text the search did not touch
 * is byte-for-byte what it was before this component existed: one text node,
 * which is what a `getByText` in a test and a screen reader both expect.
 */
export function HighlightText({ text, term, terms }: HighlightTextProps) {
  const segments = terms === undefined ? splitOnTerm(text, term) : splitOnTerms(text, terms);
  if (!segments.some((s) => s.hit)) return <>{text}</>;
  return (
    <>
      {segments.map((s, i) =>
        s.hit ? (
          <Box key={`${String(i)}-${s.text}`} component="mark" sx={MARK_SX}>
            {s.text}
          </Box>
        ) : (
          <Fragment key={`${String(i)}-${s.text}`}>{s.text}</Fragment>
        ),
      )}
    </>
  );
}
