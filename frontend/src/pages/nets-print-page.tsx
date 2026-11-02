import { useNavigate, useParams, useSearchParams } from 'react-router';
import { Typography } from '@mui/material';
import { LoadingSpinner } from '@/components/common';
import { PrintPageShell } from '@/components/common/sheet-export';
import { NetsTable } from '@/components/pace/NetsTable';
import { useNets, useSections } from '@/services';
import { NET_RADIO_TYPE_LABELS, PACE_THEATER_LABELS, carriedBy, inTheater } from '@/types';
import { parseTheater, theaterSuffix } from '@/components/pace/theater';

/**
 * One squadron's nets for one radio, chrome free and read only, for print
 * and Save as PDF. Reached from Print / Save PDF on /nets/:section, which
 * hands over the radio tab it had open. Portrait: a net list is rows. The
 * table prints in the app's dark palette, as the library print does.
 */
export function NetsPrintPage() {
  const { section } = useParams<{ section: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const radioTab: 'jem' | 'mpu5' = searchParams.get('radio') === 'mpu5' ? 'mpu5' : 'jem';
  const theater = parseTheater(searchParams.get('theater'));
  const { data: sections } = useSections();
  const { data, isLoading } = useNets(section);
  const nets = (data?.nets ?? []).filter(
    (n) => carriedBy(n.radio_type, radioTab) && inTheater(n.theater, theater),
  );
  const sectionLabel = sections?.find((sec) => sec.key === section)?.label ?? section?.toUpperCase() ?? '';
  const radioLabel = NET_RADIO_TYPE_LABELS[radioTab];
  const theaterLabel = PACE_THEATER_LABELS[theater];

  return (
    <PrintPageShell
      orientation="portrait"
      rootAttr="data-nets-print-root"
      backLabel="Back to nets"
      onBack={() => { void navigate(`/nets/${String(section)}?radio=${radioTab}${theaterSuffix(theater, '&')}`); }}
      printDisabled={isLoading}
    >
      <Typography sx={{
        fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 15, letterSpacing: '0.14em',
        textTransform: 'uppercase', color: 'var(--shf-amber)', mb: 1.5,
      }}>
        {sectionLabel} - Nets Library - {theaterLabel} {radioLabel}
      </Typography>
      {isLoading ? <LoadingSpinner /> : <NetsTable nets={nets} radioLabel={radioLabel} theaterLabel={theaterLabel} canWrite={false} />}
    </PrintPageShell>
  );
}
