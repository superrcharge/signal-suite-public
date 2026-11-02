import SvgIcon, { type SvgIconProps } from '@mui/material/SvgIcon';

/**
 * The PACE plan as a list: P, A, C, E down the left, one line each, the
 * lines shortening down the list the way the fallbacks do. Rows sit 6 units
 * apart on a 24-unit box, so the spacing is even by construction and each
 * row has air; the first cuts had taller letters on tighter rows and read as
 * stacked.
 *
 * Drawn here rather than taken from `@mui/icons-material`: the
 * SettingsInputAntenna glyph it replaces was read as anatomy at tile size,
 * and the numbered-list glyph has three rows where PACE has four.
 *
 * The letters are SVG text in Barlow Condensed Bold, the face the catalog
 * sheets already ship in `public/fonts` and register in
 * `styles/catalog-tokens.css`. A condensed bold is what lets four capitals
 * stack in 24 units and still read; stroked-path letters were tried and
 * were either cramped or thin. Rows are 6 apart and the letters 6.8 tall,
 * so their caps (about 4.8) leave clear space between rows.
 *
 * A test that looks up the letter P on a page the header is drawn on has to
 * scope its query below the header, as `pace-editor-page.test.tsx` does.
 */
const ROWS = [
  { letter: 'P', y: 3, length: 12 },
  { letter: 'A', y: 9, length: 10 },
  { letter: 'C', y: 15, length: 8 },
  { letter: 'E', y: 21, length: 6 },
] as const;

export function PaceIcon(props: SvgIconProps) {
  return (
    <SvgIcon viewBox="0 0 24 24" {...props}>
      {ROWS.map(({ letter, y, length }) => (
        <g key={letter}>
          <text
            x="4.6"
            y={y + 2.4}
            fontSize="6.8"
            fontWeight={700}
            fontFamily="'Barlow Condensed', 'Roboto Condensed', 'Arial Narrow', sans-serif"
            textAnchor="middle"
            fill="currentColor"
          >
            {letter}
          </text>
          <line
            x1="9.5"
            y1={y}
            x2={9.5 + length}
            y2={y}
            stroke="currentColor"
            strokeWidth="2.6"
            strokeLinecap="round"
          />
        </g>
      ))}
    </SvgIcon>
  );
}
