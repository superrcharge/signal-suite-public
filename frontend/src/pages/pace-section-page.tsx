import { useNavigate, useParams } from 'react-router';
import { Box, Button, Tooltip, Typography } from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import EditIcon from '@mui/icons-material/Edit';

import { MainLayout } from '@/components/layouts/main-layout';
import { PAGE_W, SheetPreview } from '@/components/pace/SheetPreview';
import { usePaceCard, useSections } from '@/services';
import { LoadingSpinner, PageBanner, PageTitle } from '@/components/common';
import { DocumentActions, paceExportSpec } from '@/components/common/sheet-export';
import { BANNER_BTN_AMBER_SX, BANNER_BTN_PAPER_SX } from '@/components/common/banner-controls';
import { usePaceSections } from '@/components/pace/use-pace-sections';
import { useAuth } from '@/contexts/auth-context';
import { NotFoundPage } from './not-found-page';
import '@/styles/catalog-tokens.css';

export function PaceSectionPage() {
  const { section } = useParams<{ section: string }>();
  const navigate = useNavigate();
  const { canWritePace } = useAuth();
  const { data: sections } = useSections();
  const { hasCard, isLoading: sectionsLoading } = usePaceSections();
  const { data: card, isLoading, isError } = usePaceCard(section);

  // Only the card-bearing squadrons resolve, so /pace/esqd - or any typo -
  // does not render a full card for a section that does not have one.
  //
  // The wait is not optional. Which squadrons have a card is a column on
  // `sections` now, so the answer arrives with a query rather than from a
  // constant; returning NotFoundPage before it lands would flash "not found" for
  // a squadron that exists, on every load.
  if (sectionsLoading) return <LoadingSpinner />;
  if (!section || !hasCard(section)) {
    return <NotFoundPage />;
  }

  const sectionLabel =
    sections?.find((s) => s.key === section)?.label ?? section.toUpperCase();

  return (
    <MainLayout>
      {/* The same action bar as catalog-sheet-page: back and title on the
          left, Edit then share then Print right-justified through
          DocumentActions. The PACE trio should behave like the catalog trio,
          not invent its own chrome. */}
      <PageBanner sx={{ mb: 2 }}>
        {/* The bar's contents span exactly the card below: SheetPreview centres
            a fixed PAGE_W sheet, so a PAGE_W box centred the same way puts the
            back button on the card's left edge and Print on its right. */}
        <Box sx={{ flex: 1, maxWidth: PAGE_W, mx: 'auto', display: 'flex', alignItems: 'center', gap: 2, minWidth: 0 }}>
        {/* LEFT */}
        <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', gap: 1.5, minWidth: 0 }}>
          <Button
            startIcon={<ArrowBackIcon />}
            onClick={() => void navigate('/pace')}
            size="small"
            variant="outlined"
            // White: navigation, like every back button in the catalog.
            sx={BANNER_BTN_PAPER_SX}
          >
            Wheels
          </Button>
          {/* The squadron only. The card title is deliberately not repeated
              here: the sheet prints it in its own header, centred on the page,
              so showing it again a few inches away said the same thing twice.
              The squadron slug earns its place because it tells you which card
              you are on without reading the sheet. */}
          <PageTitle noWrap>{sectionLabel}</PageTitle>
        </Box>

        {/* RIGHT: Edit, then share and Print - the order every printable page
            uses (see DocumentActions). Printing is a read action, so it sits
            outside the canWritePace guard: a viewer needs the sheet as much as
            an editor does. No Tooltip on Print: MUI promotes a Tooltip title to
            the child's aria-label, which would rename the control. */}
        <DocumentActions inset={3.5} onPrint={() => window.open(`/pace/${section}/print`, '_blank')} spec={paceExportSpec(section, sectionLabel)}>
          {canWritePace && (
            <Tooltip title="Edit this card">
              <Button
                startIcon={<EditIcon />}
                size="small"
                onClick={() => void navigate(`/pace/${section}/edit`)}
                variant="outlined"
                sx={BANNER_BTN_AMBER_SX}
              >
                Edit
              </Button>
            </Tooltip>
          )}
        </DocumentActions>
        </Box>
      </PageBanner>

      {/* A failed fetch gets its own state rather than falling through to the
          sheet: an empty sheet is exactly what a squadron with no card yet
          looks like, so drawing one for a fetch error would present a plausible
          blank card as this squadron's comms plan. */}
      {isLoading ? (
        <LoadingSpinner />
      ) : isError ? (
        <Box sx={{ pt: 8, textAlign: 'center' }}>
          <Typography color="error">
            Could not load this squadron&rsquo;s PACE card. Reload to try again.
          </Typography>
        </Box>
      ) : (
        <SheetPreview card={card} sectionLabel={sectionLabel} />
      )}
    </MainLayout>
  );
}

