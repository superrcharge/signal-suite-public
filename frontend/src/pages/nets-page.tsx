import { useNavigate, useParams, useSearchParams } from 'react-router';
import { Alert, Button, Tab, Tabs } from '@mui/material';

import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { MainLayout } from '@/components/layouts/main-layout';
import { usePaceSections } from '@/components/pace/use-pace-sections';
import { LoadingSpinner, PageBanner, PageTitle } from '@/components/common';
import { DocumentActions, netsExportSpec } from '@/components/common/sheet-export';
import { BANNER_BTN_PAPER_SX } from '@/components/common/banner-controls';
import { NetsTable } from '@/components/pace/NetsTable';
import { useAuth } from '@/contexts/auth-context';
import { useDeleteNet, useNets, useSections } from '@/services';
import { useToast } from '@/contexts';
import { ApiClientError } from '@/services/api-client';
import { NET_RADIO_TYPE_LABELS, carriedBy } from '@/types';
import type { Net } from '@/types';

import { NetDrawer } from './net-drawer';
import { NotFoundPage } from './not-found-page';

export function NetsPage() {
  // rto writes nets: this is the role the PACE Planner exists for.
  const { section } = useParams<{ section: string }>();
  const { hasCard, isLoading: paceSectionsLoading } = usePaceSections();
  const navigate = useNavigate();
  const { canWritePace } = useAuth();
  const { showToast } = useToast();
  const { data: sections } = useSections();
  const { data, isLoading } = useNets(section);
  const deleteNet = useDeleteNet();

  // Drawer state lives in the URL, matching terminals and kits -- it is what
  // lets the header's Add Net button deep-link straight into the add drawer.
  const [searchParams, setSearchParams] = useSearchParams();
  const drawerParam = searchParams.get('drawer');
  const editId = searchParams.get('id');

  // The tab lives in the URL so a link can point straight at one radio's list.
  const radioTab: 'jem' | 'mpu5' = searchParams.get('radio') === 'mpu5' ? 'mpu5' : 'jem';

  const allNets = data?.nets ?? [];
  // A "both" net appears under each tab rather than being duplicated in the
  // library -- that duplication is what the shared value exists to avoid.
  const nets = allNets.filter((n) => carriedBy(n.radio_type, radioTab));

  const setRadioTab = (next: 'jem' | 'mpu5') => {
    const params = new URLSearchParams(searchParams);
    params.set('radio', next);
    params.delete('drawer');
    params.delete('id');
    setSearchParams(params);
  };

  // Counted per tab rather than from `nets`, because a "both" net is carried by
  // each radio and so counts under both: the two figures can legitimately sum to
  // more than the library holds.
  const countFor = (radio: 'jem' | 'mpu5') =>
    allNets.filter((n) => carriedBy(n.radio_type, radio)).length;

  const sectionLabel =
    sections?.find((sec) => sec.key === section)?.label ?? section?.toUpperCase() ?? '';

  // Resolved against every net, not the filtered tab: an edit deep-link must
  // still open if the net does not belong to the tab currently selected.
  const drawerNet =
    drawerParam === 'edit' ? (allNets.find((n) => n.id === editId) ?? null) : null;
  // An edit URL opens only once the net it names has actually resolved. The
  // drawer reads net === null as Add mode, so opening on an unresolved id --
  // while the list is still loading, or forever for a deleted or hand-typed
  // one -- would show a blank Add Net form at an edit URL, and submitting it
  // would create a duplicate instead of editing anything.
  const drawerOpen =
    drawerParam === 'add' || (drawerParam === 'edit' && drawerNet !== null);
  // Both said out loud rather than left as a drawer that never appears. An add
  // link is shareable, so a viewer can arrive at one from an rto's URL and find
  // the drawer gated shut on them -- silence would read as the page being broken.
  const editTargetMissing =
    drawerParam === 'edit' && Boolean(editId) && !isLoading && drawerNet === null;
  const addNotPermitted = drawerParam === 'add' && !canWritePace;

  const openEdit = (net: Net) => {
    // Spread, not replace: dropping the whole query string takes `radio` with
    // it, snapping the list behind the drawer back to the JEM tab.
    const next = new URLSearchParams(searchParams);
    next.set('drawer', 'edit');
    next.set('id', net.id);
    setSearchParams(next);
  };

  const closeDrawer = () => {
    const next = new URLSearchParams(searchParams);
    next.delete('drawer');
    next.delete('id');
    setSearchParams(next);
  };

  const handleDelete = async (net: Net) => {
    if (!window.confirm(`Delete net "${net.name}"? This cannot be undone.`)) return;
    try {
      await deleteNet.mutateAsync(net.id);
      showToast('Net deleted');
    } catch (err) {
      showToast(
        err instanceof ApiClientError ? err.message : 'Could not delete net',
        { severity: 'error' },
      );
    }
  };

  // Only the card-bearing squadrons resolve, so /pace/esqd - or any typo -
  // does not render a full card for a section that does not have one.
  //
  // The wait is not optional. Which squadrons have a card is a column on
  // `sections` now, so the answer arrives with a query rather than from a
  // constant; returning NotFoundPage before it lands would flash "not found" for
  // a squadron that exists, on every load.
  if (paceSectionsLoading) return <LoadingSpinner />;
  if (!section || !hasCard(section)) return <NotFoundPage />;

  return (
    <MainLayout>
      {/* The same banner and the same back-in-the-top-left shape every other
          page uses. "All squadrons" was a plain text button floated right,
          which is the one place in the app the way out was not where the eye
          goes looking for it.

          The heading also drops "to add a new NET, click the add net button at
          the top of the page". A heading is not the place for instructions, and
          the button it describes is a few inches away. */}
      <PageBanner sx={{ mb: 2 }}>
        {/* White, like every back button: navigation. ml 0.5 puts its left
            edge on the table's, which sits at the layout's 24px gutter. */}
        <Button
          startIcon={<ArrowBackIcon />}
          onClick={() => void navigate('/nets')}
          variant="outlined"
          sx={{ ...BANNER_BTN_PAPER_SX, ml: 0.5 }}
        >
          All squadrons
        </Button>
        {/* Centred between the way out and the document actions. */}
        <PageTitle noWrap sx={{ flex: 1, textAlign: 'center', minWidth: 0 }}>{sectionLabel} - Nets Library</PageTitle>
        {/* Share then Print, right end, the same slot every printable page
            uses; inset 3 ends them on the table's right edge at the 24px
            gutter. Print opens a read-only view of the radio tab on screen. */}
        <DocumentActions
          inset={3}
          onPrint={() => { window.open(`/nets/${section}/print?radio=${radioTab}`, '_blank'); }}
          spec={netsExportSpec(`${sectionLabel} ${NET_RADIO_TYPE_LABELS[radioTab]} nets`)}
        />
      </PageBanner>

      {(editTargetMissing || addNotPermitted) && (
        <Alert severity="warning" sx={{ mb: 2 }} onClose={closeDrawer}>
          {editTargetMissing
            ? 'That net no longer exists - it may have been deleted. Nothing has been opened for editing.'
            : 'You do not have permission to add nets. Nothing has been opened.'}
        </Alert>
      )}

      {/* Two folder tabs across the full width. The open one is the folder's
          tab: the table's paper colour, rounded on top, with the concave
          shoulders of a manila folder where it meets its neighbour, drawn by
          two pseudo-elements - a 12px square with a transparent quarter-circle
          cut from its outer top corner. The shoulder on the outer edge of an
          end tab is dropped: a folder's edge tab has none. The table below is
          the folder body, so its top corners are square and the open tab sits
          flush on it. The closed tab keeps a readable label colour - with only
          two, the second is easy to miss entirely. */}
      <Tabs
        value={radioTab}
        onChange={(_, next: 'jem' | 'mpu5') => setRadioTab(next)}
        variant="fullWidth"
        sx={{
          minHeight: 44,
          '& .MuiTabs-indicator': { display: 'none' },
          '& .MuiTabs-flexContainer': { alignItems: 'flex-end' },
          '& .MuiTab-root': {
            minHeight: 40,
            px: 3,
            fontSize: '0.9rem',
            fontWeight: 600,
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
            color: 'text.secondary',
            position: 'relative',
            overflow: 'visible',
            borderRadius: '12px 12px 0 0',
          },
          '& .MuiTab-root.Mui-selected': {
            color: 'var(--shf-amber)',
            bgcolor: 'background.paper',
            minHeight: 44,
            '&::before, &::after': { content: '""', position: 'absolute', bottom: 0, width: 12, height: 12 },
            '&::before': {
              left: -12,
              background: (t) => `radial-gradient(circle at 0 0, transparent 12px, ${t.palette.background.paper} 12.5px)`,
            },
            '&::after': {
              right: -12,
              background: (t) => `radial-gradient(circle at 100% 0, transparent 12px, ${t.palette.background.paper} 12.5px)`,
            },
          },
          '& .MuiTab-root:first-of-type.Mui-selected::before': { display: 'none' },
          '& .MuiTab-root:last-of-type.Mui-selected::after': { display: 'none' },
        }}
      >
        <Tab value="jem" label={`${NET_RADIO_TYPE_LABELS.jem} Nets (${countFor('jem')})`} />
        <Tab value="mpu5" label={`${NET_RADIO_TYPE_LABELS.mpu5} Nets (${countFor('mpu5')})`} />
      </Tabs>


      {isLoading ? (
        <LoadingSpinner />
      ) : (
        <NetsTable
          nets={nets}
          radioLabel={NET_RADIO_TYPE_LABELS[radioTab]}
          canWrite={canWritePace}
          squareTop
          onEdit={openEdit}
          onDelete={(net) => { void handleDelete(net); }}
        />
      )}

      <NetDrawer open={canWritePace && drawerOpen} section={section} net={drawerNet} onClose={closeDrawer} />
    </MainLayout>
  );
}
