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
} from '@mui/material';
import HistoryIcon from '@mui/icons-material/History';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import { useNavigate } from 'react-router';
import { MainLayout } from '@/components/layouts';
import {
  SectionEditDialog, PageBanner, PageTitle, PageSubtitle,
  PANEL_SX, TABLE_HEAD_SX, TIGHT_CELL_SX,
} from '@/components/common';
import { CsvCatalogue } from '@/components/common/csv';
import { useSections, useTags, useCreateTag, useDeleteTag } from '@/services';
import { useAuth } from '@/contexts/auth-context';
import type { Section, Tag } from '@/types';

/**
 * Settings is the single discovery point for admin-adjacent controls:
 * section management, tag management, CSV export, and the audit log. Each panel is
 * gated by role so viewers see a mostly-empty page, editors see
 * Section Management + Tag Management + Export, and admins see everything.
 */
export function SettingsPage() {
  const navigate = useNavigate();
  const { canWrite, isAdmin } = useAuth();
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

  return (
    <MainLayout>
      <PageBanner variant="plain" sx={{ mb: 3 }}>
        <PageTitle sx={{ minWidth: 0 }}>
          Settings
          <PageSubtitle>Manage sections, tags, export data, and review the audit log.</PageSubtitle>
        </PageTitle>
      </PageBanner>
      {/* Section Management: admin + editor */}
      {canWrite && (
        <Panel title="Sections" description="Rename, recolor, or delete sections. Deleting a section with terminals prompts for reassignment.">
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
      {canWrite && (
        <Panel title="Tags" description="Every tag in the system, whether it was created here or typed on a terminal. Deleting a tag removes it from all terminals that have it applied.">
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
      {/* Data import and export: one row per dataset, generated from the CSV
          registry so a new domain appears here without editing this page. */}
      <Panel
        title="Data import and export"
        description="Download any dataset as CSV, get a matching import template, or import a filled-in file. Nets and PACE channels export one squadron at a time, so their controls live on the squadron pages."
      >
        <CsvCatalogue />
      </Panel>
      {/* Audit Log: admin only */}
      {isAdmin && (
        <Panel title="Audit log" description="Every create, update, delete, and role change across the app. Admin-only.">
          <Button
            variant="outlined"
            startIcon={<HistoryIcon />}
            onClick={() => navigate('/audit')}
          >
            Open audit log
          </Button>
        </Panel>
      )}
      {/* Viewer-only fallback so the page isn't blank */}
      {!canWrite && !isAdmin && (
        <Alert severity="info">
          You currently have viewer access. Contact an admin for elevated permissions.
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
    </MainLayout>
  );
}

function Panel({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <Paper elevation={0} sx={{ ...PANEL_SX, p: 2.5, mb: 2 }}>
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
