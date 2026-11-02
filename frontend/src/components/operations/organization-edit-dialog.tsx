import { useEffect, useState } from 'react';
import {
  Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle,
} from '@mui/material';

import { OrganizationFields } from '@/components/operations/organization-fields';
import {
  EMPTY_ORGANIZATION_DRAFT, createOrganizationRequestOf, organizationDraftComplete,
  organizationDraftOf, updateOrganizationRequestOf,
} from '@/components/catalog/organization-draft';
import type { OrganizationDraft } from '@/components/catalog/organization-draft';
import { useCreateOrganization, useSections, useUpdateOrganization } from '@/services';
import { errorMessage } from '@/services/api-client';
import type { Organization } from '@/types';

/**
 * Add or edit one organization, for the Settings page's Organizations tab.
 *
 * The form, its validation and the request bodies are the ones the Join
 * Operation wizard's Add to library uses, so the two surfaces cannot drift in
 * what they offer or send. `organization` null is Add; set is Edit, where the
 * key is read-only because the server has no rename.
 *
 * A server error stays in the dialog with the draft intact: closing on a 409
 * for a taken name would lose what was typed.
 */
export function OrganizationEditDialog({ open, organization, onClose }: {
  open: boolean;
  organization: Organization | null;
  onClose: () => void;
}) {
  const mode: 'add' | 'edit' = organization ? 'edit' : 'add';
  const { data: sectionsData } = useSections();
  const sections = (sectionsData ?? []).map(s => ({ key: s.key, label: s.label }));
  const createOrganization = useCreateOrganization();
  const updateOrganization = useUpdateOrganization();

  const [draft, setDraft] = useState<OrganizationDraft>(EMPTY_ORGANIZATION_DRAFT);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setDraft(organization ? organizationDraftOf(organization) : EMPTY_ORGANIZATION_DRAFT);
      setError(null);
    }
  }, [open, organization]);

  const pending = createOrganization.isPending || updateOrganization.isPending;
  const complete = organizationDraftComplete(draft, mode);

  const handleSave = async () => {
    if (!complete || pending) return;
    setError(null);
    try {
      if (organization) {
        await updateOrganization.mutateAsync({ key: organization.key, data: updateOrganizationRequestOf(draft) });
      } else {
        await createOrganization.mutateAsync(createOrganizationRequestOf(draft));
      }
      onClose();
    } catch (err) {
      setError(errorMessage(err, mode === 'edit' ? 'Could not save the organization' : 'Could not add the organization'));
    }
  };

  return (
    <Dialog open={open} onClose={pending ? undefined : onClose} fullWidth maxWidth="sm">
      <DialogTitle sx={{ pb: 1 }}>{mode === 'edit' ? 'Edit organization' : 'Add organization'}</DialogTitle>
      <DialogContent>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>{error}</Alert>
        )}
        <Box sx={{ mt: 1 }}>
          <OrganizationFields
            draft={draft}
            setDraft={setDraft}
            sections={sections}
            mode={mode}
            onEnter={() => { void handleSave(); }}
          />
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={pending}>Cancel</Button>
        <Button
          variant="contained"
          onClick={() => { void handleSave(); }}
          disabled={!complete || pending}
          startIcon={pending ? <CircularProgress size={14} /> : undefined}
        >
          Save
        </Button>
      </DialogActions>
    </Dialog>
  );
}
