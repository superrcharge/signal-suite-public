import { useState } from 'react';
import type { CSSProperties } from 'react';
import {
  Box,
  Button,
  Collapse,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Select,
  TextField,
  Typography,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import LiveHelpOutlinedIcon from '@mui/icons-material/LiveHelpOutlined';

import { useAuth } from '@/contexts/auth-context';
import { useAddRfiComment, useCreateRfi, useOperationRfis, useResolveRfi } from '@/services';
import { errorMessage } from '@/services/api-client';
import { formatDateTime } from '@/utils';
import type { Operation, Participant, RFI } from '@/types';
import { participantLabel } from './participant-label';

const MAX_LENGTH = 2000;

const pipSty = (color: string): CSSProperties => ({
  display: 'block', width: 10, height: 10, borderRadius: '50%', flexShrink: 0,
  background: color || 'transparent',
  border: color ? 0 : '1px solid var(--shf-graphite-600)',
});

const captionLineSx = {
  fontFamily: 'var(--font-mono)', fontSize: 10.5, letterSpacing: '0.04em', color: 'text.secondary',
} as const;

const labelSx = {
  fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 13,
  letterSpacing: '0.06em', textTransform: 'uppercase',
} as const;

const cardSx = {
  border: 1, borderColor: 'divider', borderRadius: 1, p: 1.5, display: 'flex', flexDirection: 'column', gap: 1,
} as const;

/**
 * The RFI board of one operation, as a popup from the banner. Open RFIs
 * newest first, each with the unit that raised it, its question and a flat
 * thread of replies; a writer can raise one (picking which unit it speaks
 * for, since users carry no organization), reply to any, and resolve the ones
 * they posted themselves. Resolved RFIs fold into a collapsed section at the
 * foot, read-only. A reader gets the list and Close.
 */
export function RfiDialog({ open, operation, participants, onClose }: {
  open: boolean;
  operation: Operation;
  participants: Participant[];
  onClose: () => void;
}) {
  const { canWritePace, user } = useAuth();
  const { data } = useOperationRfis(operation.id, open);
  const createRfi = useCreateRfi();
  const addComment = useAddRfiComment();
  const resolveRfi = useResolveRfi();

  const [composing, setComposing] = useState(false);
  const [asking, setAsking] = useState('');
  const [question, setQuestion] = useState('');
  const [replies, setReplies] = useState<Record<string, string>>({});
  const [showResolved, setShowResolved] = useState(false);
  const [error, setError] = useState('');

  const rfis = data?.rfis ?? [];
  const openRfis = rfis.filter((r) => r.status === 'open');
  const resolvedRfis = rfis.filter((r) => r.status === 'resolved');
  const byId = new Map(participants.map((p) => [p.id, p]));
  const busy = createRfi.isPending || addComment.isPending || resolveRfi.isPending;

  const cancelCompose = () => { setComposing(false); setAsking(''); setQuestion(''); setError(''); };

  const post = () => {
    setError('');
    createRfi.mutate({ operationId: operation.id, data: { participant_id: asking, question: question.trim() } }, {
      onSuccess: () => { cancelCompose(); },
      onError: (err) => { setError(errorMessage(err, 'Could not post the RFI')); },
    });
  };

  const reply = (rfi: RFI) => {
    setError('');
    const body = (replies[rfi.id] ?? '').trim();
    addComment.mutate({ operationId: operation.id, rfiId: rfi.id, data: { body } }, {
      onSuccess: () => { setReplies((prev) => ({ ...prev, [rfi.id]: '' })); },
      onError: (err) => { setError(errorMessage(err, 'Could not add the reply')); },
    });
  };

  const resolve = (rfi: RFI) => {
    setError('');
    resolveRfi.mutate({ operationId: operation.id, rfiId: rfi.id }, {
      onError: (err) => { setError(errorMessage(err, 'Could not resolve the RFI')); },
    });
  };

  const unitOf = (rfi: RFI) => {
    const p = rfi.participant_id ? byId.get(rfi.participant_id) : undefined;
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <span data-testid="rfi-pip" style={pipSty(p?.organization.color ?? '')} />
        <Typography component="span" sx={labelSx}>{p ? participantLabel(p) : 'Unit removed'}</Typography>
      </Box>
    );
  };

  const card = (rfi: RFI) => {
    const isOpen = rfi.status === 'open';
    const draft = replies[rfi.id] ?? '';
    return (
      <Box key={rfi.id} component="li" data-testid="rfi-card" sx={{ ...cardSx, listStyle: 'none' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, flexWrap: 'wrap' }}>
          {unitOf(rfi)}
          <Typography component="span" sx={captionLineSx}>
            {`${rfi.created_by} · ${formatDateTime(rfi.created_at)}`}
          </Typography>
        </Box>
        <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{rfi.question}</Typography>

        {rfi.comments.length > 0 && (
          <Box component="ul" sx={{ m: 0, p: 0, pl: 2, display: 'flex', flexDirection: 'column', gap: 1, borderLeft: 2, borderColor: 'divider' }}>
            {rfi.comments.map((c) => (
              <Box component="li" key={c.id} sx={{ listStyle: 'none' }}>
                <Typography component="div" sx={captionLineSx}>
                  {`${c.created_by} · ${formatDateTime(c.created_at)}`}
                </Typography>
                <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{c.body}</Typography>
              </Box>
            ))}
          </Box>
        )}

        {isOpen && canWritePace && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <TextField
              size="small"
              fullWidth
              placeholder="Add a reply"
              value={draft}
              onChange={(e) => { setReplies((prev) => ({ ...prev, [rfi.id]: e.target.value })); }}
              slotProps={{ htmlInput: { maxLength: MAX_LENGTH, 'aria-label': 'Reply' } }}
            />
            <Button
              variant="outlined"
              disabled={busy || draft.trim() === ''}
              onClick={() => { reply(rfi); }}
              sx={{ flexShrink: 0 }}
            >
              Reply
            </Button>
          </Box>
        )}

        {isOpen && canWritePace && user?.id !== undefined && rfi.created_by_id === user.id && (
          <Box>
            <Button variant="outlined" disabled={busy} onClick={() => { resolve(rfi); }}>Resolve</Button>
          </Box>
        )}

        {!isOpen && (
          <Typography component="div" sx={captionLineSx}>
            {`Resolved by ${rfi.resolved_by}${rfi.resolved_at ? ` on ${formatDateTime(rfi.resolved_at)}` : ''}`}
          </Typography>
        )}
      </Box>
    );
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle
        component="div"
        sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 2, pb: 1 }}
      >
        <Box>
          <Typography variant="h6" component="h2" sx={{ fontWeight: 600, lineHeight: 1.3 }}>
            RFIs
          </Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>
            {operation.name}
          </Typography>
        </Box>
        <IconButton aria-label="close" onClick={onClose} size="small" sx={{ flexShrink: 0 }}>
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent dividers sx={{ py: 2, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        {composing && canWritePace && (
          <Box sx={{ ...cardSx, gap: 1.5 }} data-testid="rfi-composer">
            <FormControl size="small" fullWidth>
              <InputLabel id="rfi-asking-label">Asking as</InputLabel>
              <Select
                labelId="rfi-asking-label"
                label="Asking as"
                value={asking}
                onChange={(e) => { setAsking(e.target.value); }}
                renderValue={(v) => {
                  const p = byId.get(v);
                  return p ? participantLabel(p) : '';
                }}
              >
                {participants.map((p) => (
                  <MenuItem key={p.id} value={p.id} sx={{ gap: 1 }}>
                    <span style={pipSty(p.organization.color)} />
                    {participantLabel(p)}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField
              multiline
              minRows={3}
              fullWidth
              label="Question"
              value={question}
              onChange={(e) => { setQuestion(e.target.value); }}
              slotProps={{ htmlInput: { maxLength: MAX_LENGTH } }}
              helperText={`${String(question.length)} / ${String(MAX_LENGTH)}`}
            />
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Button
                variant="contained"
                disableElevation
                disabled={busy || asking === '' || question.trim() === ''}
                onClick={post}
              >
                Post
              </Button>
              <Button onClick={cancelCompose} disabled={busy}>Cancel</Button>
            </Box>
          </Box>
        )}

        {error && <Typography role="alert" variant="body2" sx={{ color: 'error.main' }}>{error}</Typography>}

        {openRfis.length === 0 ? (
          <Typography variant="body2" sx={{ color: 'text.secondary', py: 2, textAlign: 'center' }}>
            No open RFIs.
          </Typography>
        ) : (
          <Box component="ul" sx={{ m: 0, p: 0, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            {openRfis.map(card)}
          </Box>
        )}

        {resolvedRfis.length > 0 && (
          <Box>
            <Button
              size="small"
              aria-expanded={showResolved}
              onClick={() => { setShowResolved((v) => !v); }}
              endIcon={(
                <ExpandMoreIcon
                  fontSize="small"
                  sx={{ transform: showResolved ? 'rotate(180deg)' : 'none', transition: 'transform 150ms' }}
                />
              )}
            >
              {`Resolved (${String(resolvedRfis.length)})`}
            </Button>
            {/* Collapse, not Accordion: an Accordion brings its own Paper into
                DialogContent, as in the CSV dialog. */}
            <Collapse in={showResolved} unmountOnExit>
              <Box component="ul" sx={{ m: 0, p: 0, pt: 1, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                {resolvedRfis.map(card)}
              </Box>
            </Collapse>
          </Box>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2, gap: 1 }}>
        {canWritePace && (
          <Button
            variant="contained"
            disableElevation
            startIcon={<LiveHelpOutlinedIcon />}
            disabled={composing}
            onClick={() => { setComposing(true); }}
          >
            Post RFI
          </Button>
        )}
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}
