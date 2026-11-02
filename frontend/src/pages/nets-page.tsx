import { useNavigate, useParams, useSearchParams } from 'react-router';
import { Alert, Box, Button, Tab, Tabs } from '@mui/material';

import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { MainLayout } from '@/components/layouts/main-layout';
import { usePaceSections } from '@/components/pace/use-pace-sections';
import { LoadingSpinner, PageBanner, PageTitle, folderTabsSx } from '@/components/common';
import { DocumentActions, netsExportSpec } from '@/components/common/sheet-export';
import { BANNER_BTN_PAPER_SX } from '@/components/common/banner-controls';
import { NetsTable } from '@/components/pace/NetsTable';
import { TheaterSwitch } from '@/components/pace/TheaterSwitch';
import { parseTheater, theaterSuffix, withTheater } from '@/components/pace/theater';
import { useAuth } from '@/contexts/auth-context';
import { useDeleteNet, useNets, useSections } from '@/services';
import { useToast } from '@/contexts';
import { ApiClientError } from '@/services/api-client';
import { NET_RADIO_TYPE_LABELS, PACE_THEATER_LABELS, carriedBy, inTheater } from '@/types';
import type { Net } from '@/types';

import { netsLibraryPath, type NetCreated } from '@/components/pace/net-landing';

import { NetDrawer } from './net-drawer';
import { NotFoundPage } from './not-found-page';

export function NetsPage() {
  // rto writes nets: this is the role the PACE Planner exists for.
  const { section } = useParams<{ section: string }>();
  const { sections: squadrons, hasCard, isLoading: paceSectionsLoading } = usePaceSections();
  const navigate = useNavigate();
  const { canWritePace } = useAuth();
  const { showToast } = useToast();
  const { data: sections } = useSections();
  const { data, isLoading } = useNets(section);
  const deleteNet = useDeleteNet();

  // Drawer state lives in the URL, matching terminals and kits, so an edit is
  // a link. The header's Add Net no longer deep-links here: it opens its own
  // drawer in place (components/pace/net-landing.ts).
  const [searchParams, setSearchParams] = useSearchParams();
  const drawerParam = searchParams.get('drawer');
  const editId = searchParams.get('id');

  // The tab lives in the URL so a link can point straight at one radio's list.
  const radioTab: 'jem' | 'mpu5' = searchParams.get('radio') === 'mpu5' ? 'mpu5' : 'jem';
  // So does the theater, the same way the card page carries it: CONUS is the
  // default and stays out of the URL.
  const theater = parseTheater(searchParams.get('theater'));

  const allNets = data?.nets ?? [];
  // A "both" net appears under each tab rather than being duplicated in the
  // library -- that duplication is what the shared value exists to avoid. The
  // same again for theater: a net used in both is entered once.
  const nets = allNets.filter(
    (n) => carriedBy(n.radio_type, radioTab) && inTheater(n.theater, theater),
  );

  const setRadioTab = (next: 'jem' | 'mpu5') => {
    const params = new URLSearchParams(searchParams);
    params.set('radio', next);
    params.delete('drawer');
    params.delete('id');
    setSearchParams(params);
  };

  // Keeps the radio tab; drops the drawer, as the tab switch does, because the
  // net it was editing may not be in the list any more.
  const setTheater = (next: typeof theater) => {
    const params = withTheater(searchParams, next);
    params.delete('drawer');
    params.delete('id');
    setSearchParams(params, { replace: true });
  };

  // Counted per tab rather than from `nets`, because a "both" net is carried by
  // each radio and so counts under both: the two figures can legitimately sum to
  // more than the library holds. Within the theater on screen, so the count
  // is the list the tab opens.
  const countFor = (radio: 'jem' | 'mpu5') =>
    allNets.filter((n) => carriedBy(n.radio_type, radio) && inTheater(n.theater, theater)).length;

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

  // Land where the new net is: see net-landing.ts for why. The header's own
  // Add Net drawer lands the same way through the same helper. A push, not a
  // replace, so Back returns to the library the user came from.
  const handleCreated = (created: NetCreated) => {
    void navigate(netsLibraryPath(created, searchParams));
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

  // Only the card-bearing squadrons resolve, so /pace/zsqd - or any typo -
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
      <PageBanner
        sx={{
          mb: 2,
          // Three columns, so the title's centre is the banner's centre. As a
          // flex row it was centred in whatever the controls left, which put it
          // about 100px left of centre. The sides may not shrink below their
          // content, and the middle may shrink to nothing, so a long squadron
          // name truncates before it can touch either side.
          display: 'grid',
          gridTemplateColumns: 'minmax(max-content, 1fr) minmax(0, max-content) minmax(max-content, 1fr)',
        }}
      >
        {/* White, like every back button: navigation. ml 0.5 puts its left
            edge on the table's, which sits at the layout's 24px gutter. */}
        <Button
          startIcon={<ArrowBackIcon />}
          onClick={() => void navigate('/nets')}
          variant="outlined"
          sx={{ ...BANNER_BTN_PAPER_SX, ml: 0.5, justifySelf: 'start' }}
        >
          All squadrons
        </Button>
        {/* Centred between the way out and the document actions, with the
            theater beside it: the same switch the card page carries, in the
            same place, so it is learned once. */}
        <PageTitle noWrap sx={{ textAlign: 'center', minWidth: 0 }}>{sectionLabel} - Nets Library</PageTitle>
        <Box sx={{ justifySelf: 'end', display: 'flex', alignItems: 'center', gap: 2 }}>
          <TheaterSwitch value={theater} onChange={setTheater} />
          {/* Share then Print, right end, the same slot every printable page
              uses; inset 3 ends them on the table's right edge at the 24px
              gutter. Print opens a read-only view of the radio tab on screen. */}
          <DocumentActions
            inset={3}
            onPrint={() => { window.open(`/nets/${section}/print?radio=${radioTab}${theaterSuffix(theater, '&')}`, '_blank'); }}
            spec={netsExportSpec(`${sectionLabel} ${PACE_THEATER_LABELS[theater]} ${NET_RADIO_TYPE_LABELS[radioTab]} nets`)}
          />
        </Box>
      </PageBanner>

      {(editTargetMissing || addNotPermitted) && (
        <Alert severity="warning" sx={{ mb: 2 }} onClose={closeDrawer}>
          {editTargetMissing
            ? 'That net no longer exists - it may have been deleted. Nothing has been opened for editing.'
            : 'You do not have permission to add nets. Nothing has been opened.'}
        </Alert>
      )}

      {/* Two folder tabs across the full width, in the shared folder-tab
          style (`folderTabsSx`, also on Settings and the Loadout): every tab
          outlined so it reads as a control, the open one amber and filled
          with the table's paper colour. The table below is the folder body.
          The closed tab keeps a readable label colour - with only two, the
          second is easy to miss entirely. The concave folder shoulders this
          strip used to draw were dropped with the outlines: with a gap
          between outlined tabs they overlapped the neighbour's border. */}
      <Tabs
        value={radioTab}
        onChange={(_, next: 'jem' | 'mpu5') => setRadioTab(next)}
        variant="fullWidth"
        sx={folderTabsSx({ panelBg: 'background.paper' })}
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
          theaterLabel={PACE_THEATER_LABELS[theater]}
          canWrite={canWritePace}
          squareTop
          onEdit={openEdit}
          onDelete={(net) => { void handleDelete(net); }}
        />
      )}

      <NetDrawer
        open={canWritePace && drawerOpen}
        section={section}
        squadrons={squadrons}
        theater={theater}
        net={drawerNet}
        onClose={closeDrawer}
        onCreated={handleCreated}
      />
    </MainLayout>
  );
}
