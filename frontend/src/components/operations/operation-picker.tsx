import { Alert, Box } from '@mui/material';
import { useNavigate } from 'react-router';

import { EmptyState, LoadingSpinner, TILE_GRID_SX } from '@/components/common';
import { PickerTile } from '@/components/pace/SectionPicker';
import { useOperations } from '@/services';
import { errorMessage } from '@/services/api-client';
import { operationDisplayName } from './operation-title';

interface OperationPickerProps {
  /** Built with the operation id, e.g. `(id) => `/operations/${id}``. */
  hrefFor: (operationId: string) => string;
}

/** Operation chooser: one tile per operation, each opening that operation. */
export function OperationPicker({ hrefFor }: OperationPickerProps) {
  const navigate = useNavigate();
  const { data, isLoading, isError, error } = useOperations();

  if (isLoading) return <LoadingSpinner />;
  if (isError) {
    return <Alert severity="error">{errorMessage(error, 'Could not load operations')}</Alert>;
  }

  const operations = data?.operations ?? [];
  if (operations.length === 0) {
    return (
      <EmptyState
        title="No operations yet"
        description="Add one from the + menu or the button above."
      />
    );
  }

  return (
    <Box sx={TILE_GRID_SX}>
      {/* The tile reads the acronym ("OMS") above the dot and the name beneath
          it, both in the label style, with a leading word "Operation" dropped
          from the name; without an acronym it is dot then name. No dates: the
          app shows none anywhere. */}
      {operations.map((op) => (
        <PickerTile
          key={op.id}
          topLabel={op.acronym || undefined}
          label={operationDisplayName(op)}
          square
          onOpen={() => void navigate(hrefFor(op.id))}
        />
      ))}
    </Box>
  );
}
