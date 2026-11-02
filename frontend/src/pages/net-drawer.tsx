import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Checkbox,
  FormControlLabel,
  Button,
  Divider,
  Drawer,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';

import { useCreateNet, useUpdateNet } from '@/services';
import { ApiClientError } from '@/services/api-client';
import { useToast } from '@/contexts';
import {
  NET_FREQ_UNITS,
  NET_RADIO_TYPES,
  NET_RADIO_TYPE_LABELS,
  NET_THEATERS,
  NET_THEATER_LABELS,
  type Net,
  type NetFreqUnit,
  type NetRadioType,
  type NetTheater,
  type PaceTheater,
  type Section,
} from '@/types';

import type { NetCreated } from '@/components/pace/net-landing';

export type { NetCreated };

interface NetDrawerProps {
  open: boolean;
  /**
   * The squadron a new net starts in: the library on screen. It is a seed, not
   * the answer. The drawer shows it in a Squadron select the user can change,
   * because the API never moves a net between squadrons, so one filed under
   * the wrong squadron can only be deleted and typed in again.
   */
  section: string;
  /**
   * The squadrons a net can belong to: the card-bearing ones. Passed in rather
   * than read through a hook, so the drawer keeps calling only the two mutation
   * hooks its closed test mock lists.
   */
  squadrons: Section[];
  /**
   * The theater on screen, which a newly created net starts in. Optional so
   * the drawer's own tests, which have no page around them, keep the default.
   */
  theater?: PaceTheater;
  /** null adds a new net; a net edits it. */
  net: Net | null;
  onClose: () => void;
  /**
   * Called instead of onClose after a create, with where the net went. The
   * drawer shows the toast, naming the squadron; the host decides where to
   * land, which is the one thing it knows and the drawer does not.
   */
  onCreated: (created: NetCreated) => void;
}

interface FormState {
  section: string;
  name: string;
  netId: string;
  radioType: NetRadioType;
  theater: NetTheater;
  txFreq: string;
  rxFreq: string;
  freqUnit: NetFreqUnit;
  roip: boolean;
  notes: string;
}

const EMPTY_FORM: FormState = {
  section: '',
  name: '',
  netId: '',
  radioType: 'both',
  theater: 'conus',
  txFreq: '',
  rxFreq: '',
  freqUnit: 'MHz',
  roip: false,
  notes: '',
};

// Mirrors the `max=` tags on radionet's CreateNetRequest. Capped as typed
// rather than caught at save: the server 400s on a longer value, and a length
// limit the user cannot see until they press Save reads as the form losing
// their text. Same numbers as the terminal, kit and contract drawers.
const NAME_MAX = 100;
const NET_ID_MAX = 50;
const FREQ_MAX = 60;
const NOTES_MAX = 250;

function formFromNet(net: Net | null, section: string, theater: PaceTheater): FormState {
  if (!net) return { ...EMPTY_FORM, section, theater };
  return {
    section: net.section,
    name: net.name,
    netId: net.net_id,
    radioType: (NET_RADIO_TYPES as readonly string[]).includes(net.radio_type)
      ? (net.radio_type as NetRadioType)
      : 'both',
    theater: (NET_THEATERS as readonly string[]).includes(net.theater)
      ? (net.theater as NetTheater)
      : 'both',
    txFreq: net.tx_freq,
    rxFreq: net.rx_freq,
    freqUnit: (NET_FREQ_UNITS as readonly string[]).includes(net.freq_unit)
      ? (net.freq_unit as NetFreqUnit)
      : 'MHz',
    roip: net.roip,
    notes: net.notes,
  };
}

export function NetDrawer({
  open,
  section,
  squadrons,
  theater = 'conus',
  net,
  onClose,
  onCreated,
}: NetDrawerProps) {
  const isEdit = net !== null;
  const { showToast } = useToast();
  const createNet = useCreateNet();
  const updateNet = useUpdateNet();

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);

  // Reset when the drawer opens, and when an open drawer is retargeted at a
  // different net, so a previous edit never bleeds into the next one.
  //
  // Keyed on the net's id, not the object. `net` comes out of the nets query,
  // so any refetch of that list -- a window-focus refetch, another editor
  // saving -- hands back a fresh object for the same net, and keying on
  // identity would wipe whatever the user had typed into the open form.
  const netId = net?.id ?? null;
  const latestNet = useRef(net);
  latestNet.current = net;
  useEffect(() => {
    if (!open) return;
    setForm(formFromNet(latestNet.current, section, theater));
    setError(null);
  }, [open, netId, section, theater]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const isPending = createNet.isPending || updateNet.isPending;

  const handleSubmit = async () => {
    const name = form.name.trim();
    if (!name) {
      setError('Name is required.');
      return;
    }
    // Only reachable with an empty squadrons list, which the page never
    // passes: it 404s before rendering the drawer unless the squadron on
    // screen has a card. Said out loud rather than sent, because the server
    // would answer "section not found" about a path the user never saw.
    if (!isEdit && !form.section) {
      setError('Squadron is required.');
      return;
    }
    setError(null);

    const payload = {
      name,
      net_id: form.netId.trim(),
      radio_type: form.radioType,
      theater: form.theater,
      tx_freq: form.txFreq.trim(),
      rx_freq: form.rxFreq.trim(),
      freq_unit: form.freqUnit,
      roip: form.roip,
      notes: form.notes.trim(),
    };

    try {
      if (isEdit) {
        await updateNet.mutateAsync({ id: net.id, data: payload });
        showToast('Net updated');
        onClose();
      } else {
        // The squadron in the form, not the prop: the prop is where the user
        // started, the form is where they said the net goes.
        await createNet.mutateAsync({ section: form.section, data: payload });
        // Named, for the same reason the select is shown: the squadron is the
        // one fact about a net that cannot be corrected afterwards.
        const label = squadrons.find((s) => s.key === form.section)?.label ?? form.section.toUpperCase();
        showToast(`Net created in ${label}`);
        onCreated({ section: form.section, radioType: form.radioType, theater: form.theater });
      }
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Could not save net.');
    }
  };

  return (
    <Drawer anchor="right" open={open} onClose={onClose}>
      <Box sx={{ width: { xs: '100vw', sm: 420 }, p: 2.5 }} role="form">
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
          <Typography variant="h6" sx={{ flexGrow: 1 }}>
            {isEdit ? 'Edit Net' : 'Add Net'}
          </Typography>
          <IconButton onClick={onClose} size="small" aria-label="close">
            <CloseIcon />
          </IconButton>
        </Box>
        <Divider sx={{ mb: 2 }} />

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        <Stack spacing={2}>
          {/* First, because it is the one field that cannot be fixed later: a
              net never moves between squadrons. Pre-selected to the library on
              screen, so the common case is a glance, and changeable so a net
              typed in from the wrong library still lands in the right one.
              Edit mode hides it: the API does not take it, and the page title
              already names the squadron. Same select as the terminal and kit
              drawers' Section, minus their None and Create rows: a net always
              has a squadron, and only one with a card can hold nets. */}
          {!isEdit && (
            <FormControl fullWidth size="small" required>
              <InputLabel id="net-squadron-label">Squadron</InputLabel>
              <Select
                labelId="net-squadron-label"
                label="Squadron"
                value={form.section}
                onChange={(e) => set('section', e.target.value)}
                inputProps={{ 'aria-label': 'Squadron' }}
              >
                {squadrons.map((s) => (
                  <MenuItem key={s.key} value={s.key}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: s.color, flexShrink: 0 }} />
                      {s.label}
                    </Box>
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          )}
          <TextField
            label="Name"
            required
            fullWidth
            size="small"
            value={form.name}
            onChange={(e) => set('name', e.target.value)}
            autoFocus
            slotProps={{ htmlInput: { maxLength: NAME_MAX } }}
          />
          <TextField
            label="Channel #"
            fullWidth
            size="small"
            value={form.netId}
            onChange={(e) => set('netId', e.target.value)}
            slotProps={{ htmlInput: { maxLength: NET_ID_MAX } }}
          />

          {/* A net that genuinely runs on both radios picks "Both" rather than
              being entered twice. */}
          <Box>
            <Typography variant="caption" color="text.secondary">
              Carried by
            </Typography>
            <ToggleButtonGroup
              size="small"
              exclusive
              fullWidth
              aria-label="Carried by"
              value={form.radioType}
              onChange={(_, next: NetRadioType | null) => {
                if (next) set('radioType', next);
              }}
              sx={{ mt: 0.5 }}
            >
              {NET_RADIO_TYPES.map((rt) => (
                <ToggleButton key={rt} value={rt}>
                  {NET_RADIO_TYPE_LABELS[rt]}
                </ToggleButton>
              ))}
            </ToggleButtonGroup>
          </Box>

          {/* The same shape as Carried by: a net used in both theaters is
              entered once. A new net starts in the theater the page is on. */}
          <Box>
            <Typography variant="caption" color="text.secondary">
              Theater
            </Typography>
            <ToggleButtonGroup
              size="small"
              exclusive
              fullWidth
              aria-label="Theater"
              value={form.theater}
              onChange={(_, next: NetTheater | null) => {
                if (next) set('theater', next);
              }}
              sx={{ mt: 0.5 }}
            >
              {NET_THEATERS.map((th) => (
                <ToggleButton key={th} value={th}>
                  {NET_THEATER_LABELS[th]}
                </ToggleButton>
              ))}
            </ToggleButtonGroup>
          </Box>

          <Box>
            <Typography variant="caption" color="text.secondary">
              Frequency unit
            </Typography>
            <ToggleButtonGroup
              size="small"
              exclusive
              fullWidth
              aria-label="Frequency unit"
              value={form.freqUnit}
              onChange={(_, next: NetFreqUnit | null) => {
                if (next) set('freqUnit', next);
              }}
              sx={{ mt: 0.5 }}
            >
              {NET_FREQ_UNITS.map((unit) => (
                <ToggleButton key={unit} value={unit}>
                  {unit}
                </ToggleButton>
              ))}
            </ToggleButtonGroup>
          </Box>

          {/* Freeform on purpose: a net is recorded as a range or a placeholder
              word as readily as a single figure. */}
          <TextField
            label="TX frequency"
            fullWidth
            size="small"
            value={form.txFreq}
            onChange={(e) => set('txFreq', e.target.value)}
            helperText="Free text - a figure, a range, or a reference"
            slotProps={{ htmlInput: { maxLength: FREQ_MAX } }}
          />
          <TextField
            label="RX frequency"
            fullWidth
            size="small"
            value={form.rxFreq}
            onChange={(e) => set('rxFreq', e.target.value)}
            helperText="Leave matching TX for a simplex net"
            slotProps={{ htmlInput: { maxLength: FREQ_MAX } }}
          />

          {/* Tracked per net so a card can show at a glance which nets are
              carried over IP. */}
          <FormControlLabel
            control={
              <Checkbox
                checked={form.roip}
                onChange={(e) => set('roip', e.target.checked)}
                size="small"
              />
            }
            label="ROIP"
          />

          <TextField
            label="Notes"
            fullWidth
            size="small"
            multiline
            minRows={2}
            value={form.notes}
            onChange={(e) => set('notes', e.target.value)}
            slotProps={{ htmlInput: { maxLength: NOTES_MAX } }}
          />
        </Stack>

        <Box sx={{ display: 'flex', gap: 1, mt: 3 }}>
          <Button variant="contained" onClick={() => void handleSubmit()} disabled={isPending}>
            {/* "Save Changes", matching terminal-drawer, kit-drawer and
                contract-drawer. This drawer was the only one of the four
                lowercasing it, so the help step naming it was accurate and the
                button was the outlier. */}
            {isEdit ? 'Save Changes' : 'Create'}
          </Button>
          <Button onClick={onClose} disabled={isPending}>
            Cancel
          </Button>
        </Box>
      </Box>
    </Drawer>
  );
}
