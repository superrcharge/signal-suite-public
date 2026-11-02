import { useRef } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { Alert, Box, Button, Tooltip } from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import EditIcon from '@mui/icons-material/Edit';
import GroupsIcon from '@mui/icons-material/Groups';
import LiveHelpOutlinedIcon from '@mui/icons-material/LiveHelpOutlined';

import { MainLayout } from '@/components/layouts';
import { CONTENT_GUTTER, HEADER_HEIGHT } from '@/components/layouts/main-layout';
import { LoadingSpinner, PageBanner, PageTitle } from '@/components/common';
import {
  BANNER_BTN_AMBER_SX,
  BANNER_BTN_PAPER_SX,
  BANNER_ICON_BTN_SX,
  CONTENT_LINE,
  RAIL_BANNER_H,
} from '@/components/common/banner-controls';
import { chipToggleSty } from '@/components/catalog/chip-styles';
import { JoinOperationDialog } from '@/components/operations/join-operation-dialog';
import { OperationMatrixView } from '@/components/operations/operation-matrix-view';
import { OperationShareActions } from '@/components/operations/operation-share-actions';
import { OperationWebView } from '@/components/operations/operation-web-view';
import { ParticipantBoard } from '@/components/operations/participant-board';
import { ParticipantsDialog } from '@/components/operations/participants-dialog';
import { RfiDialog } from '@/components/operations/rfi-dialog';
import { useAuth } from '@/contexts/auth-context';
import { useOperation } from '@/services';
import { ApiClientError, errorMessage } from '@/services/api-client';
import { NotFoundPage } from './not-found-page';
import { OperationDrawer } from './operation-drawer';
import '@/styles/catalog-tokens.css';

/**
 * One operation: the participant board, one tab per organization saying
 * what it is bringing, on the Comms Library's full-bleed graphite canvas
 * under a rail banner. The banner holds Participants, a popup roster of who
 * has joined, whose own action is Join Operation, the wizard; the empty
 * Loadout view offers it too. The body is the planning surface rather than
 * a form.
 *
 * Every popup is URL state, like the drawer: `?dialog=participants` is the
 * list, `?dialog=rfis` the RFI board, `?dialog=join` the wizard, and `?dialog=join&pid=<id>` the wizard in
 * edit mode for that row. Edit lives in the same drawer the picker opens,
 * driven by `?drawer=edit`. No `id` param: the page already knows which
 * operation it is on.
 *
 * The body has three views, switched by chips round the banner title:
 * Loadout on its left, Matrix and Web on its right. Loadout is the board, one
 * tab per participant with a standard panel under it (`?unit=<participant id>`
 * is the open one, which the Participants popup also writes), Matrix the
 * participants as columns, each cell naming the assets that give the row -
 * what everyone could talk on, and through what - and Web one phase drawn as a
 * picture of who must talk to whom, units in their locations, with the
 * planning panel for writers. `?view=matrix` and `?view=web`
 * are the other two; absent means Loadout, the asymmetry the catalog tab
 * already uses, so a plain link to the operation opens on Loadout, and an
 * unknown value, a retired `?view=units`, `?view=links` or `?view=cards`
 * included, reads as Loadout too. Matrix and Web also read `?phase=`, which
 * the page does not own; Web is always about one phase, so there it defaults
 * to the first.
 */
const VIEW_LABELS = { loadout: 'Loadout', matrix: 'Matrix', web: 'Web' } as const;
type View = keyof typeof VIEW_LABELS;

/** One chip of the pair; the title sits between the two, so they are not one map. */
function ViewChip({ view, current, onSelect }: { view: View; current: View; onSelect: (next: View) => void }) {
  const active = view === current;
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={() => {
        if (!active) onSelect(view);
      }}
      style={{ ...chipToggleSty(active, true), flexShrink: 0 }}
    >
      {VIEW_LABELS[view]}
    </button>
  );
}

export function OperationPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { canWritePace } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const { data, isLoading, isError, error } = useOperation(id);
  // Set by a delete. The drawer closes itself after `onDeleted`, and closing
  // writes this route's query string, which would navigate straight back to
  // the page of an operation that no longer exists.
  const deleted = useRef(false);

  if (isLoading) return <LoadingSpinner />;
  // The server's 404 and a missing id both mean "no such operation", so both
  // land on the same page the PACE section route shows for an unknown squadron.
  if (!id || (isError && error instanceof ApiClientError && error.status === 404)) {
    return <NotFoundPage />;
  }

  // A viewer never gets the drawer, whatever the URL says, as on the picker.
  const drawerOpen = canWritePace && searchParams.get('drawer') === 'edit';

  const openDrawer = () =>
    setSearchParams((prev) => {
      const n = new URLSearchParams(prev);
      n.set('drawer', 'edit');
      return n;
    });

  const closeDrawer = () => {
    if (deleted.current) return;
    setSearchParams((prev) => {
      const n = new URLSearchParams(prev);
      n.delete('drawer');
      return n;
    });
  };

  // The popups. Participants opens for every role; the wizard, like the
  // drawer, never opens for a viewer whatever the URL says. A `pid` naming no
  // row on the operation - checked out since the link was made - falls back
  // to create mode rather than an edit of nothing.
  const dialog = searchParams.get('dialog');
  const pid = searchParams.get('pid');
  const participantsOpen = dialog === 'participants';
  const joinOpen = canWritePace && dialog === 'join';
  const rfisOpen = dialog === 'rfis';

  const openDialog = (which: 'participants' | 'join' | 'rfis', participantId?: string) =>
    setSearchParams((prev) => {
      const n = new URLSearchParams(prev);
      n.set('dialog', which);
      if (participantId) n.set('pid', participantId);
      else n.delete('pid');
      return n;
    });

  const closeDialog = () =>
    setSearchParams((prev) => {
      const n = new URLSearchParams(prev);
      n.delete('dialog');
      n.delete('pid');
      return n;
    });

  const viewParam = searchParams.get('view');
  const view: View = viewParam === 'matrix' || viewParam === 'web' ? viewParam : 'loadout';
  const selectView = (next: View) =>
    setSearchParams((prev) => {
      const n = new URLSearchParams(prev);
      if (next === 'loadout') n.delete('view');
      else n.set('view', next);
      return n;
    }, { replace: true });

  // A click on a row of the Participants popup: close it and flip the Loadout
  // view to that unit's tab. Loadout is the default view, so `view` is dropped
  // rather than written; every other param, `phase` included, is kept.
  const openUnit = (participantId: string) =>
    setSearchParams((prev) => {
      const n = new URLSearchParams(prev);
      n.delete('view');
      n.delete('dialog');
      n.delete('pid');
      n.set('unit', participantId);
      return n;
    });

  const operation = data?.operation;
  const participants = data?.participants ?? [];
  const phases = data?.phases ?? [];
  const sites = data?.sites ?? [];
  const editing = pid ? participants.find((p) => p.id === pid) : undefined;

  // Write-gated and amber: Edit on the record. Join Operation is not in the
  // banner (maintainer, 2026-10-12): it is the Participants popup's own action
  // and the empty Loadout view's prompt, and the bar needs its width at 1280
  // for share and Print / Save PDF.
  const writeControls = canWritePace && operation && (
    <>
      <Button
        startIcon={<EditIcon />}
        size="small"
        variant="outlined"
        sx={BANNER_BTN_AMBER_SX}
        onClick={openDrawer}
      >
        Edit
      </Button>
    </>
  );

  return (
    <MainLayout>
      <PageBanner sticky sx={{ mb: 2 }}>
        {/* LEFT: the white controls together - back to the picker, then the
            Participants roster and the RFI board, which open for every role.
            Grouping by colour is the maintainer's call: white is navigation
            and reading, amber is writing, so each side of the bar reads as
            one kind of thing. The back control is the bare arrow in the
            banner's 30px icon square: from an operation the only way back
            is to the picker, so the word Operations only repeated what the
            arrow says and spent width the title needs at the 1280 floor. The
            tooltip and the accessible name still carry it. */}
        <Box data-testid="banner-left" sx={{ flex: 1, minWidth: 'max-content', display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Tooltip title="Operations">
            <Button
              aria-label="Operations"
              size="small"
              variant="outlined"
              // White: navigation, like every back button in the catalog.
              sx={{ ...BANNER_BTN_PAPER_SX, ...BANNER_ICON_BTN_SX, flexShrink: 0 }}
              onClick={() => void navigate('/operations')}
            >
              <ArrowBackIcon sx={{ fontSize: 16 }} />
            </Button>
          </Tooltip>
          {operation && (
            <Button
              startIcon={<GroupsIcon />}
              size="small"
              variant="outlined"
              sx={{ ...BANNER_BTN_PAPER_SX, flexShrink: 0 }}
              onClick={() => { openDialog('participants'); }}
            >
              Participants ({participants.length})
            </Button>
          )}
          {operation && (
            <Button
              startIcon={<LiveHelpOutlinedIcon />}
              size="small"
              variant="outlined"
              sx={{ ...BANNER_BTN_PAPER_SX, flexShrink: 0 }}
              onClick={() => { openDialog('rfis'); }}
            >
              {operation.open_rfi_count ? `RFIs (${String(operation.open_rfi_count)})` : 'RFIs'}
            </Button>
          )}
        </Box>
        {/* CENTRE: the view switch around the operation's full name - Loadout
            on the left of the title, Matrix and Web on the right - in TheaterSwitch's
            shape, the chip pair the comms library banner and the PACE pages
            already use. Left and right share `flex: 1`, so the group is
            optically centred whatever either side holds. The sides keep
            `minWidth: 'max-content'` and only this group shrinks, so at the
            1280 floor the title truncates rather than the view chips landing
            on top of Participants (n): with `minWidth: 0` on the sides and
            `flexShrink: 0` here, that overlap is exactly what happened. */}
        <Box
          data-testid="banner-centre"
          role="group"
          aria-label="View"
          sx={{ flexShrink: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 1.5 }}
        >
          {operation && <ViewChip view="loadout" current={view} onSelect={selectView} />}
          <PageTitle noWrap sx={{ minWidth: 0 }}>{operation ? operation.name : ''}</PageTitle>
          {operation && <ViewChip view="matrix" current={view} onSelect={selectView} />}
          {operation && <ViewChip view="web" current={view} onSelect={selectView} />}
        </Box>
        {/* RIGHT: the two amber controls together, both write-gated - Join
            Operation, the wizard, then Edit on the record. It keeps its own
            flex: 1 even when empty, so the title stays centred for a viewer.
            Who can talk to whom lives on the catalog's joint matrix; this
            page does not draw a second one. */}
        {/* On the Matrix and Web views the share menu joins them at the right
            end, and the two ride inside it as DocumentActions' own children,
            which is where the PACE page puts its Edit. */}
        <Box data-testid="banner-right" sx={{ flex: 1, minWidth: 'max-content', display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 1.5 }}>
          {(view === 'web' || view === 'matrix') && operation ? (
            <OperationShareActions operation={operation} participants={participants} phases={phases} sites={sites} view={view}>
              {writeControls}
            </OperationShareActions>
          ) : writeControls}
        </Box>
      </PageBanner>

      {isError || !operation ? (
        <Alert severity="error">{errorMessage(error, 'Could not load the operation')}</Alert>
      ) : (
        // The Comms Library's canvas: full bleed, graphite, filling the window
        // under the header and banner, capped at the library width.
        <Box sx={{
          background: 'var(--shf-graphite-900)',
          minHeight: `calc(100vh - ${String(HEADER_HEIGHT + RAIL_BANNER_H)}px)`,
          mx: -CONTENT_GUTTER,
          mb: -CONTENT_GUTTER,
        }}>
          {/* The Web view is a drawing that gets more from more width, so it alone is not capped. */}
          {/* No top padding on Matrix and Web: the banner's margin is the gap
              above the phase row, as on the Loadout tabs. */}
          {/* Centred in the canvas: with the sidebar closed the canvas is wider
              than the 1280 cap, and an uncentred box hugged the left edge with an
              empty band on the right (maintainer, 10-25). */}
          <Box sx={{ width: '100%', maxWidth: view === 'web' ? undefined : 1280, mx: 'auto' }}>
            {view === 'matrix' ? (
              <Box sx={{ p: `0 ${String(CONTENT_LINE)}px ${String(CONTENT_LINE)}px` }}>
                <OperationMatrixView participants={participants} phases={phases} />
              </Box>
            ) : view === 'web' ? (
              <Box sx={{ p: `0 ${String(CONTENT_LINE)}px ${String(CONTENT_LINE)}px` }}>
                <OperationWebView operation={operation} participants={participants} phases={phases} sites={sites} canWrite={canWritePace} />
              </Box>
            ) : (
              <ParticipantBoard
                phases={phases}
                sites={sites}
                participants={participants}
                canWrite={canWritePace}
                onJoin={() => { openDialog('join'); }}
                onEdit={(p) => { openDialog('join', p.id); }}
              />
            )}
          </Box>
        </Box>
      )}

      {drawerOpen && operation && (
        <OperationDrawer
          open
          operation={operation}
          phases={phases}
          sites={sites}
          participants={participants}
          onClose={closeDrawer}
          onDeleted={() => {
            deleted.current = true;
            void navigate('/operations', { replace: true });
          }}
        />
      )}

      {participantsOpen && operation && (
        <ParticipantsDialog
          open
          operation={operation}
          participants={participants}
          onClose={closeDialog}
          onJoin={() => { openDialog('join'); }}
          onEdit={(p) => { openDialog('join', p.id); }}
          onOpen={(p) => { openUnit(p.id); }}
        />
      )}

      {rfisOpen && operation && (
        <RfiDialog
          open
          operation={operation}
          participants={participants}
          onClose={closeDialog}
        />
      )}

      {joinOpen && operation && (
        <JoinOperationDialog
          open
          operation={operation}
          participants={participants}
          participant={editing}
          phases={phases}
          initialStep={editing ? 2 : undefined}
          onClose={closeDialog}
        />
      )}
    </MainLayout>
  );
}
