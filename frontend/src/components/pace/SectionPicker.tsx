import { Box, Card, CardActionArea, Typography } from '@mui/material';
import { useNavigate } from 'react-router';

import { LoadingSpinner } from '@/components/common';
import { useSections } from '@/services';
import { hasPaceCard } from './pace-constants';
import { usePaceEmblem } from './use-pace-emblem';

interface SectionPickerProps {
  /** Built with the section key, e.g. `(k) => `/nets/${k}``. */
  hrefFor: (sectionKey: string) => string;
}

/** Square-ish, because these pages are mostly empty space and a squadron is a
 *  thing you recognise by its patch before you read its name. */
export const TILE = 200;

/** The tile's label style, shared by `label` and `topLabel` so they cannot drift. */
const LABEL_SX = {
  fontFamily: 'var(--font-display)',
  fontWeight: 700,
  fontSize: 15,
  letterSpacing: '0.14em',
  textTransform: 'uppercase',
  textAlign: 'center',
} as const;

/**
 * The tile itself: presentational, so any "pick one of these" grid can reuse
 * it. An optional top label, then an image when there is one, otherwise a
 * coloured dot, then the label and an optional caption line.
 */
export function PickerTile({
  label,
  topLabel,
  color,
  imageUrl,
  caption,
  onOpen,
  ariaLabel,
  square = false,
}: {
  label: string;
  /** Rendered above the image or dot in the label's own style. */
  topLabel?: string;
  color?: string;
  imageUrl?: string | null;
  caption?: string;
  onOpen: () => void;
  ariaLabel?: string;
  /**
   * Height follows the width, for a grid of fixed-width columns
   * (TILE_GRID_SX) where a fixed TILE height would draw a rectangle.
   */
  square?: boolean;
}) {
  return (
    <Card variant="outlined" sx={{ background: 'var(--shf-graphite-800)' }}>
      <CardActionArea
        onClick={onOpen}
        aria-label={ariaLabel}
        sx={{
          ...(square ? { aspectRatio: '1' } : { height: TILE }),
          p: 2,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 1.5,
        }}
      >
        {topLabel && <Typography sx={LABEL_SX}>{topLabel}</Typography>}
        {imageUrl ? (
          <Box
            component="img"
            src={imageUrl}
            alt=""
            sx={{
              width: 96,
              height: 96,
              objectFit: 'cover',
              // Round, matching the wheel hub that clips it to a circle, so the
              // patch looks the same here as it does on the card.
              borderRadius: '50%',
              flexShrink: 0,
            }}
          />
        ) : (
          <Box
            data-testid="picker-tile-dot"
            sx={{
              width: 16,
              height: 16,
              borderRadius: '50%',
              flexShrink: 0,
              bgcolor: color ?? 'primary.main',
            }}
          />
        )}
        <Typography sx={LABEL_SX}>{label}</Typography>
        {caption && (
          <Typography
            sx={{
              fontFamily: 'var(--font-mono)',
              fontSize: 10.5,
              color: 'var(--shf-graphite-300)',
              textAlign: 'center',
            }}
          >
            {caption}
          </Typography>
        )}
      </CardActionArea>
    </Card>
  );
}

/**
 * One squadron.
 *
 * Its own component so it can own a hook: the emblem is fetched per squadron,
 * and hooks cannot be called from inside a map.
 */
function SquadronTile({
  sectionKey,
  label,
  color,
  onOpen,
}: {
  sectionKey: string;
  label: string;
  color: string;
  onOpen: () => void;
}) {
  // The picker lists squadrons without loading their cards, so it has no
  // emblem_url to check first. It asks for the emblem and treats a 404 as "this
  // squadron has none". objectUrl rather than emblemHref, because a squadron
  // without an emblem should show its name and nothing else, not the generated
  // SAMPLE EMBLEM placeholder the sheet falls back to.
  const { objectUrl } = usePaceEmblem(sectionKey, undefined, label, {
    fetchWhenUnknown: true,
  });

  return <PickerTile label={label} color={color} imageUrl={objectUrl} onOpen={onOpen} />;
}

/**
 * Squadron chooser, shared by the PACE dashboard and the Nets Library.
 *
 * Both are "pick a squadron, then work on its thing", and both list exactly the
 * card-bearing squadrons -- so they are one component with a different
 * destination rather than two that drift apart.
 */
export function SectionPicker({ hrefFor }: SectionPickerProps) {
  const navigate = useNavigate();
  const { data: sections, isLoading } = useSections();

  if (isLoading) return <LoadingSpinner />;

  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: `repeat(auto-fill, minmax(${TILE}px, 1fr))`,
        gap: 2,
      }}
    >
      {(sections ?? [])
        .filter(hasPaceCard)
        .map((sec) => (
          <SquadronTile
            key={sec.key}
            sectionKey={sec.key}
            label={sec.label}
            color={sec.color}
            onOpen={() => void navigate(hrefFor(sec.key))}
          />
        ))}
    </Box>
  );
}
