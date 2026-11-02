import { useState } from 'react';
import {
  Box,
  Typography,
  Paper,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Alert,
  IconButton,
  Tooltip,
  TextField,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  CircularProgress,
  Tab,
  Tabs,
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import { useSearchParams } from 'react-router';
import { MainLayout } from '@/components/layouts';
import {
  SectionEditDialog, PageTitle,
  PANEL_SX, TABLE_HEAD_SX, TIGHT_CELL_SX, folderTabsSx,
} from '@/components/common';
import { CsvCatalogue } from '@/components/common/csv';
import { AuditLog } from '@/pages/audit-page';
import { OrganizationEditDialog } from '@/components/operations/organization-edit-dialog';
import {
  useSections, useTags, useCreateTag, useDeleteTag,
  useOrganizations, useDeleteOrganization,
} from '@/services';
import { errorMessage } from '@/services/api-client';
import { useAuth } from '@/contexts/auth-context';
import { roleLabel } from '@/types/role-meta';
import { BRANCH_NAMES } from '@/types';
import type { Organization, Section, Tag } from '@/types';

/**
 * The page's tabs, in the order they are drawn. The id is what `?tab=` carries,
 * so a reload keeps the open tab and a link (a help topic's "Take me there")
 * can open one directly.
 */
const SETTINGS_TABS = [
  { id: 'sections', label: 'Sections' },
  { id: 'tags', label: 'Tags' },
  { id: 'organizations', label: 'Organizations' },
  { id: 'import-export', label: 'Import/Export' },
  { id: 'audit', label: 'Audit log' },
] as const;
type SettingsTabId = (typeof SETTINGS_TABS)[number]['id'];

const operationsLabel = (n: number) => (n === 1 ? '1 operation' : `${n} operations`);

/**
 * Settings is the single discovery point for admin-adjacent controls:
 * section management, tag management, the organization library, CSV export,
 * and the audit log. One tab per panel, each gated by role; a tab the reader
 * cannot use is not drawn at all, and with only one left (a viewer's data
 * tab) the strip is not drawn either.
 */
export function SettingsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { canWrite, canWritePace, isAdmin, role } = useAuth();
  const { data: sectionsData } = useSections();
  const sections = sectionsData ?? [];

  const { data: tagsData, isLoading: tagsLoading } = useTags();
  const tags = tagsData ?? [];
  const createTagMutation = useCreateTag();
  const deleteTagMutation = useDeleteTag();
  const [editingSection, setEditingSection] = useState<Section | null>(null);
  const [newTagName, setNewTagName] = useState('');
  // Holds the entry, not the name, so the confirmation dialog can say how many
  // terminals the delete will actually touch.
  const [tagToDelete, setTagToDelete] = useState<Tag | null>(null);

  const { data: orgData, isLoading: orgsLoading } = useOrganizations();
  const organizations = orgData?.organizations ?? [];
  const deleteOrganizationMutation = useDeleteOrganization();
  // `orgDialog` is closed when null, Add when `organization` is null, and Edit
  // otherwise - one dialog, so Add and Edit cannot drift.
  const [orgDialog, setOrgDialog] = useState<{ organization: Organization | null } | null>(null);
  const [orgToDelete, setOrgToDelete] = useState<Organization | null>(null);
  const [orgDeleteError, setOrgDeleteError] = useState<string | null>(null);

  // Which tabs this reader may open. The gates are the panels' own, unchanged
  // from when the page was one scroll; organizations follow the API's writer
  // set, which is PACE's.
  const tabAllowed: Record<SettingsTabId, boolean> = {
    sections: canWrite,
    tags: canWrite,
    organizations: canWritePace,
    'import-export': true,
    audit: isAdmin,
  };
  const permittedTabs = SETTINGS_TABS.filter(t => tabAllowed[t.id]);
  // A missing, unknown or forbidden `tab` falls back to the first tab the
  // reader may open, rather than to an empty page or an error.
  const requestedTab = searchParams.get('tab');
  const activeTab: SettingsTabId =
    permittedTabs.find(t => t.id === requestedTab)?.id ?? permittedTabs[0]?.id ?? 'import-export';
  const showTabStrip = permittedTabs.length > 1;

  const setActiveTab = (next: SettingsTabId) => {
    const params = new URLSearchParams(searchParams);
    params.set('tab', next);
    setSearchParams(params);
  };
  // The open panel is the strip's tabpanel; with no strip it is just a panel.
  const tabPanelFor = (id: SettingsTabId) => (showTabStrip ? { id } : undefined);

  const handleCreateTag = () => {
    const name = newTagName.trim();
    if (!name) return;
    createTagMutation.mutate(name, {
      onSuccess: () => setNewTagName(''),
    });
  };

  const handleConfirmDeleteTag = () => {
    if (!tagToDelete) return;
    deleteTagMutation.mutate(tagToDelete.name, {
      onSuccess: () => setTagToDelete(null),
      onError: () => setTagToDelete(null),
    });
  };

  // The icon is disabled while the organization is checked in anywhere, so a
  // 409 here is a race (someone joined it since the list loaded). It stays in
  // the dialog rather than closing it, so the reader sees why nothing happened.
  const handleConfirmDeleteOrganization = () => {
    if (!orgToDelete) return;
    setOrgDeleteError(null);
    deleteOrganizationMutation.mutate(orgToDelete.key, {
      onSuccess: () => setOrgToDelete(null),
      onError: (err) => setOrgDeleteError(errorMessage(err, 'Could not delete the organization')),
    });
  };

  return (
    <MainLayout>
      {/* Hidden, as on the list pages: the header's page picker already names
          the route, and every panel below carries its own heading. The h1
          stays for screen readers and for the every-page-has-a-title check. */}
      <PageTitle visuallyHidden>Settings</PageTitle>
      {/* The Nets page's folder tabs, through the shared `folderTabsSx`.
          Hidden when only one tab is left, where a strip of one is a
          heading pretending to be a control. */}
      {showTabStrip && (
        <Tabs
          value={activeTab}
          onChange={(_, next: SettingsTabId) => setActiveTab(next)}
          variant="fullWidth"
          aria-label="Settings sections"
          sx={folderTabsSx({ panelBg: 'background.paper' })}
        >
          {permittedTabs.map(t => (
            <Tab
              key={t.id}
              value={t.id}
              label={t.label}
              id={`settings-tab-${t.id}`}
              aria-controls={`settings-tabpanel-${t.id}`}
            />
          ))}
        </Tabs>
      )}
      {/* Section Management: admin + editor */}
      {canWrite && activeTab === 'sections' && (
        <Panel tabPanel={tabPanelFor('sections')} title="Sections" description="Rename, recolor, or delete sections. Deleting a section with terminals prompts for reassignment.">
          {sections.length === 0 ? (
            <Typography
              variant="body2"
              sx={{
                color: 'text.disabled',
                py: 2
              }}>
              No sections yet. Create one from the Add Terminal drawer.
            </Typography>
          ) : (
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={TABLE_HEAD_SX}>Label</TableCell>
                    <TableCell sx={TABLE_HEAD_SX}>Key</TableCell>
                    <TableCell sx={TABLE_HEAD_SX}>Color</TableCell>
                    <TableCell sx={{ ...TABLE_HEAD_SX, width: '1%' }} aria-label="actions" />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {sections.map((s) => (
                    <TableRow key={s.key} sx={{ '&:last-child td': { border: 0 } }}>
                      <TableCell>
                        <Typography variant="body2" sx={{
                          fontWeight: 600
                        }}>{s.label}</Typography>
                      </TableCell>
                      <TableCell>
                        <Box component="span" sx={{ fontFamily: '"SF Mono","Fira Code",monospace', fontSize: 12, color: 'text.secondary' }}>
                          {s.key}
                        </Box>
                      </TableCell>
                      <TableCell>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Box sx={{ width: 14, height: 14, borderRadius: '50%', bgcolor: s.color, flexShrink: 0, border: '1px solid rgba(255,255,255,0.1)' }} />
                          <Typography
                            variant="caption"
                            sx={{
                              color: 'text.secondary',
                              fontFamily: '"SF Mono","Fira Code",monospace'
                            }}>
                            {s.color}
                          </Typography>
                        </Box>
                      </TableCell>
                      <TableCell sx={TIGHT_CELL_SX}>
                        <Tooltip title="Edit section">
                          <IconButton size="small" onClick={() => setEditingSection(s)} aria-label={`edit ${s.label}`}>
                            <EditIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </Panel>
      )}
      {/* Tag Management: admin + editor */}
      {canWrite && activeTab === 'tags' && (
        <Panel tabPanel={tabPanelFor('tags')} title="Tags" description="Every tag in the system, whether it was created here or typed on a terminal. Deleting a tag removes it from all terminals that have it applied.">
          {tagsLoading ? (
            <Box sx={{ py: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
              <CircularProgress size={16} />
              <Typography variant="body2" sx={{
                color: 'text.secondary'
              }}>Loading tags…</Typography>
            </Box>
          ) : tags.length === 0 ? (
            <Typography
              variant="body2"
              sx={{
                color: 'text.disabled',
                pb: 2
              }}>
              No tags yet. Create one below or apply a tag to a terminal from its drawer.
            </Typography>
          ) : (
            <TableContainer sx={{ mb: 2 }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={TABLE_HEAD_SX}>Name</TableCell>
                    <TableCell sx={{ ...TABLE_HEAD_SX, width: '1%' }}>Used by</TableCell>
                    <TableCell sx={{ ...TABLE_HEAD_SX, width: '1%' }} aria-label="actions" />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {tags.map((tag) => (
                    <TableRow key={tag.name} sx={{ '&:last-child td': { border: 0 } }}>
                      <TableCell>
                        <Typography variant="body2" sx={{
                          fontWeight: 600
                        }}>{tag.name}</Typography>
                      </TableCell>
                      <TableCell sx={TIGHT_CELL_SX}>
                        {/* Zero renders as "0 terminals" rather than blank: an unused
                            tag is a supported state (pre-created for an upcoming
                            operation), not a missing value. */}
                        <Typography
                          variant="body2"
                          sx={{ color: tag.terminal_count > 0 ? 'text.secondary' : 'text.disabled' }}
                        >
                          {tag.terminal_count === 1 ? '1 terminal' : `${tag.terminal_count} terminals`}
                        </Typography>
                      </TableCell>
                      <TableCell sx={TIGHT_CELL_SX}>
                        <Tooltip title="Delete tag">
                          <IconButton
                            size="small"
                            color="error"
                            onClick={() => setTagToDelete(tag)}
                            aria-label={`delete tag ${tag.name}`}
                          >
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}

          {/* Create new tag */}
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start', mt: tags.length > 0 ? 0 : undefined }}>
            <TextField
              size="small"
              label="New tag name"
              value={newTagName}
              onChange={(e) => setNewTagName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleCreateTag(); }}
              disabled={createTagMutation.isPending}
              sx={{ minWidth: 220 }}
              slotProps={{
                htmlInput: { maxLength: 100 }
              }}
            />
            <Button
              variant="outlined"
              startIcon={createTagMutation.isPending ? <CircularProgress size={14} /> : <AddIcon />}
              onClick={handleCreateTag}
              disabled={!newTagName.trim() || createTagMutation.isPending}
            >
              Add tag
            </Button>
          </Box>
          {createTagMutation.isError && (
            <Typography variant="caption" color="error" sx={{ mt: 0.5, display: 'block' }}>
              {(createTagMutation.error as { message?: string })?.message ?? 'Failed to create tag.'}
            </Typography>
          )}
        </Panel>
      )}
      {/* Organization Library: everyone but a viewer, the API's writer set for
          organizations, which is PACE's. The form, its validation and the
          request bodies are the Join Operation wizard's, through
          OrganizationEditDialog. */}
      {canWritePace && activeTab === 'organizations' && (
        <Panel tabPanel={tabPanelFor('organizations')} title="Organizations" description="The library an operation's participants are picked from. Edit one to change its name, label, branch, colour or section link; the key never changes. An organization joined to an operation cannot be deleted until it is removed from it.">
          {orgsLoading ? (
            <Box sx={{ py: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
              <CircularProgress size={16} />
              <Typography variant="body2" sx={{ color: 'text.secondary' }}>Loading organizations…</Typography>
            </Box>
          ) : organizations.length === 0 ? (
            <Typography variant="body2" sx={{ color: 'text.disabled', pb: 2 }}>
              No organizations yet. Add one below or from an operation's Join Operation wizard.
            </Typography>
          ) : (
            <TableContainer sx={{ mb: 2 }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ ...TABLE_HEAD_SX, width: '1%' }} aria-label="Color" />
                    <TableCell sx={{ ...TABLE_HEAD_SX, width: '1%' }}>Label</TableCell>
                    <TableCell sx={TABLE_HEAD_SX}>Name</TableCell>
                    <TableCell sx={{ ...TABLE_HEAD_SX, width: '1%' }}>Branch</TableCell>
                    <TableCell sx={{ ...TABLE_HEAD_SX, width: '1%' }}>Used by</TableCell>
                    <TableCell sx={{ ...TABLE_HEAD_SX, width: '1%' }} aria-label="actions" />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {organizations.map((o) => {
                    const inUse = o.operation_count > 0;
                    return (
                      <TableRow key={o.key} sx={{ '&:last-child td': { border: 0 } }}>
                        <TableCell sx={TIGHT_CELL_SX}>
                          {/* A blank colour is a supported state, drawn as an
                              empty ring rather than nothing at all. */}
                          <Box
                            title={o.color || 'No colour'}
                            sx={{
                              width: 14, height: 14, borderRadius: '50%', flexShrink: 0,
                              bgcolor: o.color || 'transparent',
                              border: o.color ? '1px solid rgba(255,255,255,0.1)' : '1px dashed',
                              borderColor: o.color ? undefined : 'text.disabled',
                            }}
                          />
                        </TableCell>
                        <TableCell sx={TIGHT_CELL_SX}>
                          {/* Drawn uppercase, as the badge on an operation is. */}
                          <Box component="span" sx={{ fontFamily: '"SF Mono","Fira Code",monospace', fontSize: 12, textTransform: 'uppercase', color: o.short_label ? 'text.primary' : 'text.disabled' }}>
                            {o.short_label || '-'}
                          </Box>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2" sx={{ fontWeight: 600 }}>{o.name}</Typography>
                        </TableCell>
                        <TableCell sx={TIGHT_CELL_SX}>
                          <Typography variant="body2" title={o.branch ? BRANCH_NAMES[o.branch] : 'No branch'} sx={{ color: o.branch ? 'text.secondary' : 'text.disabled' }}>
                            {o.branch || '-'}
                          </Typography>
                        </TableCell>
                        <TableCell sx={TIGHT_CELL_SX}>
                          <Typography variant="body2" sx={{ color: inUse ? 'text.secondary' : 'text.disabled', whiteSpace: 'nowrap' }}>
                            {operationsLabel(o.operation_count)}
                          </Typography>
                        </TableCell>
                        <TableCell sx={{ ...TIGHT_CELL_SX, whiteSpace: 'nowrap' }}>
                          <Tooltip title="Edit organization">
                            <IconButton size="small" onClick={() => setOrgDialog({ organization: o })} aria-label={`edit organization ${o.name}`}>
                              <EditIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          {/* The span lets the Tooltip still show on a disabled
                              button, which fires no pointer events of its own. */}
                          <Tooltip title={inUse ? `Joined to ${operationsLabel(o.operation_count)}; remove it from them first` : 'Delete organization'}>
                            <span>
                              <IconButton
                                size="small"
                                color="error"
                                disabled={inUse}
                                onClick={() => { setOrgDeleteError(null); setOrgToDelete(o); }}
                                aria-label={`delete organization ${o.name}`}
                              >
                                <DeleteIcon fontSize="small" />
                              </IconButton>
                            </span>
                          </Tooltip>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          )}
          <Button variant="outlined" startIcon={<AddIcon />} onClick={() => setOrgDialog({ organization: null })}>
            Add organization
          </Button>
        </Panel>
      )}
      {/* Import/Export: one row per dataset, generated from the CSV
          registry so a new domain appears here without editing this page. */}
      {activeTab === 'import-export' && (
        <Panel
          tabPanel={tabPanelFor('import-export')}
          title="Import/Export"
          description="Download any dataset as CSV, get a matching import template, or import a filled-in file. Nets and PACE channels are one squadron at a time, so they are not listed here: the Import and export control in the header covers them, and its dialogs ask which squadron."
        >
          <CsvCatalogue />
        </Panel>
      )}
      {/* Audit Log: admin only. The log itself, inline: /audit is only a
          redirect here, and audit-page.tsx provides just the AuditLog body,
          without a page title, since the tab already names it. It brings its own filter bar and table panels, so
          it is not wrapped in a Panel, only in the tabpanel the strip names. */}
      {isAdmin && activeTab === 'audit' && (
        <Box
          role={showTabStrip ? 'tabpanel' : undefined}
          id={showTabStrip ? 'settings-tabpanel-audit' : undefined}
          aria-labelledby={showTabStrip ? 'settings-tab-audit' : undefined}
        >
          <AuditLog />
        </Box>
      )}
      {/* Fallback for every role without the two panels above - viewer, but
          also rto and planner, which write elsewhere and so must not be told
          they are viewers. `role` is display-only, which is all this is. */}
      {!canWrite && !isAdmin && (
        <Alert severity="info">
          You currently have {role ? roleLabel(role) : 'read-only'} access, which does not manage sections or tags.
          Contact an admin for elevated permissions.
        </Alert>
      )}
      <SectionEditDialog
        open={!!editingSection}
        section={editingSection}
        onClose={() => setEditingSection(null)}
      />
      {/* Tag delete confirmation dialog */}
      <Dialog open={!!tagToDelete} onClose={() => setTagToDelete(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Delete tag "{tagToDelete?.name}"?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {tagToDelete && tagToDelete.terminal_count > 0
              ? `This will remove the tag from ${tagToDelete.terminal_count} terminal${tagToDelete.terminal_count === 1 ? '' : 's'}, and each one is recorded in the audit log. This action cannot be undone.`
              : 'No terminals currently use this tag. This action cannot be undone.'}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setTagToDelete(null)}>Cancel</Button>
          <Button
            color="error"
            variant="contained"
            onClick={handleConfirmDeleteTag}
            disabled={deleteTagMutation.isPending}
          >
            {deleteTagMutation.isPending ? 'Deleting…' : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>
      <OrganizationEditDialog
        open={!!orgDialog}
        organization={orgDialog?.organization ?? null}
        onClose={() => setOrgDialog(null)}
      />
      {/* Organization delete confirmation dialog */}
      <Dialog
        open={!!orgToDelete}
        onClose={deleteOrganizationMutation.isPending ? undefined : () => setOrgToDelete(null)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Delete organization?</DialogTitle>
        <DialogContent>
          {orgDeleteError && (
            <Alert severity="error" sx={{ mb: 2 }}>{orgDeleteError}</Alert>
          )}
          <DialogContentText>
            {orgToDelete
              ? `${orgToDelete.name} will be removed from the library, and no operation will be able to pick it. This action cannot be undone.`
              : ''}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOrgToDelete(null)} disabled={deleteOrganizationMutation.isPending}>Cancel</Button>
          <Button
            color="error"
            variant="contained"
            onClick={handleConfirmDeleteOrganization}
            disabled={deleteOrganizationMutation.isPending}
          >
            {deleteOrganizationMutation.isPending ? 'Deleting…' : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>
    </MainLayout>
  );
}

function Panel({
  title,
  description,
  children,
  tabPanel,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
  /**
   * Set when the tab strip is drawn: the panel is then the strip's tabpanel,
   * and its top corners are square so the open folder tab sits flush on it.
   */
  tabPanel?: { id: string };
}) {
  return (
    <Paper
      elevation={0}
      role={tabPanel ? 'tabpanel' : undefined}
      id={tabPanel ? `settings-tabpanel-${tabPanel.id}` : undefined}
      aria-labelledby={tabPanel ? `settings-tab-${tabPanel.id}` : undefined}
      sx={{
        ...PANEL_SX,
        p: 2.5,
        mb: 2,
        ...(tabPanel ? { borderTopLeftRadius: 0, borderTopRightRadius: 0 } : {}),
      }}
    >
      <Typography
        variant="h6"
        sx={{
          fontWeight: 600,
          fontSize: 16,
          mb: 0.25
        }}>
        {title}
      </Typography>
      <Typography
        variant="body2"
        sx={{
          color: 'text.secondary',
          mb: 2
        }}>
        {description}
      </Typography>
      {children}
    </Paper>
  );
}
