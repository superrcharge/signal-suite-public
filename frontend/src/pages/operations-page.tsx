import AddIcon from '@mui/icons-material/Add';
import { Button } from '@mui/material';
import { useSearchParams } from 'react-router';

import {
  BANNER_BTN_AMBER_SX,
  PageBanner,
  PageSubtitle,
  PageTitle,
  RAIL_TITLE_ML,
} from '@/components/common';
import { MainLayout } from '@/components/layouts';
import { OperationPicker } from '@/components/operations/operation-picker';
import { useAuth } from '@/contexts/auth-context';
import { useOperations } from '@/services';
import { OperationDrawer } from './operation-drawer';

/** Landing page for Operations: pick the operation to open, or add one. */
export function OperationsPage() {
  const { canWritePace } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const { data } = useOperations();

  const drawerMode = searchParams.get('drawer');
  const editId = searchParams.get('id');
  const editTarget =
    drawerMode === 'edit' && editId
      ? (data?.operations ?? []).find((o) => o.id === editId)
      : undefined;

  // The drawer opens only once its operation has resolved, so an edit link to
  // an id that does not exist shows the picker rather than an empty form.
  // A viewer never gets one, whatever the URL says.
  const drawerOpen = canWritePace && (drawerMode === 'add' || editTarget !== undefined);

  const handleDrawerClose = () =>
    setSearchParams((prev) => {
      const n = new URLSearchParams(prev);
      n.delete('drawer');
      n.delete('id');
      return n;
    });

  const handleAdd = () =>
    setSearchParams((prev) => {
      const n = new URLSearchParams(prev);
      n.set('drawer', 'add');
      n.delete('id');
      return n;
    });

  return (
    <MainLayout>
      <PageBanner sx={{ mb: 3 }}>
        <PageTitle sx={{ minWidth: 0, ml: RAIL_TITLE_ML }}>
          Operations
          <PageSubtitle>Each operation keeps its own participants, phases and locations. Pick one to open it.</PageSubtitle>
        </PageTitle>
        {canWritePace && (
          <Button
            startIcon={<AddIcon />}
            size="small"
            variant="outlined"
            sx={{ ...BANNER_BTN_AMBER_SX, ml: 'auto' }}
            onClick={handleAdd}
          >
            Add Operation
          </Button>
        )}
      </PageBanner>

      <OperationPicker hrefFor={(id) => `/operations/${id}`} />

      {drawerOpen && (
        <OperationDrawer open operation={editTarget} onClose={handleDrawerClose} />
      )}
    </MainLayout>
  );
}
