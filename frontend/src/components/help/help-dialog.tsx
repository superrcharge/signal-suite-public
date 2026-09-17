import { useMemo, useState, type ReactNode } from 'react';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Button,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  InputAdornment,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import CloseIcon from '@mui/icons-material/Close';
import SearchIcon from '@mui/icons-material/Search';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import IosShareIcon from '@mui/icons-material/IosShare';
import AddIcon from '@mui/icons-material/Add';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import FileUploadIcon from '@mui/icons-material/FileUpload';
import DescriptionIcon from '@mui/icons-material/Description';
import SatelliteDishIcon from '@mui/icons-material/SatelliteAlt';
import RouterIcon from '@mui/icons-material/Router';
import SettingsInputAntennaIcon from '@mui/icons-material/SettingsInputAntenna';
import { useNavigate } from 'react-router';

import { useAuth } from '@/contexts';
import { HELP_GROUPS, type HelpTopic } from '@/help/help-content';
import { ROLE_OPTIONS } from '@/types/role-meta';
import { RoleBadge } from '@/components/common';

interface HelpDialogProps {
  onClose: () => void;
}

function matchesSearch(topic: HelpTopic, term: string): boolean {
  if (term === '') return true;
  const haystack = [
    topic.question,
    // Resolved through specFor, not joined raw. A tokenised step is stored as
    // "@share", so searching "import and export" would have stopped matching
    // the moment text steps became icons - silently, since keywords sometimes
    // cover for it. Search is this dialog's primary affordance; it must see the
    // control's real name.
    ...(topic.steps ?? []).map((step) => specFor(step).name),
    topic.note ?? '',
    ...(topic.keywords ?? []),
  ]
    .join(' ')
    .toLowerCase();
  return haystack.includes(term);
}

/**
 * Steps that name an icon-only control render the icon itself.
 *
 * Every other step quotes text the reader can actually find on screen, which is
 * the whole premise of `help-content.ts`. That premise broke when the three
 * labelled CSV buttons and the three Add buttons each collapsed into one icon:
 * "Import and export" is the share control's tooltip and aria-label, and
 * appears nowhere on the page, so a step quoting it sent the reader hunting for
 * words that do not exist.
 *
 * Describing the icon in prose ("the share icon in the header") was the first
 * fix and was still second-hand. Drawing the control is first-hand - it is the
 * same component the header renders, so the chip cannot drift from the button
 * it points at.
 *
 * A token is the `steps` entry itself, so the data stays a plain string array
 * and search keeps working over it. An unknown token falls through and renders
 * as literal text, which is the safe direction.
 */
/**
 * What a step actually IS on screen, which decides how it is drawn.
 *
 * The `>` flow is meant to read as if it were cut out of the app - so a step
 * has to look like the thing it names. Before this, every step rendered as an
 * identical blue tile, which was wrong twice over: most steps are not tiles
 * (a field label is not a button), and nothing in this app is that blue.
 *
 * - `button` - a real button, so it gets a real box. The header triggers, a
 *   drawer's submit, Save, Delete, Download CSV.
 * - `menu` - a row in a dropdown: its icon and its label, on no box, because a
 *   menu row has no border.
 * - `text` - everything else, drawn as plain words. Field labels, page names,
 *   and placeholders like "your record".
 *
 * **`text` is the default for a bare string**, and that direction is
 * deliberate: a real control left unstyled is merely plain, whereas a field
 * label wrongly boxed is a lie about the UI. Promote a step by tokenising it,
 * never by changing the default.
 *
 * The icon components are the same ones `header.tsx` and
 * `csv-header-controls.tsx` import, so a step cannot drift from the control it
 * depicts.
 */
type StepKind = 'button' | 'menu' | 'text';

interface StepSpec {
  kind: StepKind;
  icon?: ReactNode;
  /** The words on the control. Absent means the control carries none. */
  label?: string;
  /** What to call it for a screen reader, and what search matches on. */
  name: string;
}

const STEP_SPECS: Record<string, StepSpec> = {
  // Header triggers: outlined boxes drawing a glyph and nothing else. Optical
  // sizes follow csv-header-controls.tsx - IosShare's ink fills more of its
  // viewBox than Add's, so it is drawn slightly smaller at the same box size.
  '@share': { kind: 'button', icon: <IosShareIcon sx={{ fontSize: 14 }} />, name: 'Import and export' },
  '@add': { kind: 'button', icon: <AddIcon sx={{ fontSize: 15 }} />, name: 'Add' },
  '@help': {
    kind: 'button',
    icon: (
      <Box component="span" sx={{ fontWeight: 700, fontSize: 13, lineHeight: 1 }}>
        ?
      </Box>
    ),
    name: 'I need help!',
  },

  // Rows in the share menu.
  '@export': { kind: 'menu', icon: <FileDownloadIcon sx={{ fontSize: 15 }} />, label: 'Export', name: 'Export' },
  '@template': { kind: 'menu', icon: <DescriptionIcon sx={{ fontSize: 15 }} />, label: 'Template', name: 'Template' },
  '@import': { kind: 'menu', icon: <FileUploadIcon sx={{ fontSize: 15 }} />, label: 'Import', name: 'Import' },

  // Rows in the + menu, each with its own domain icon.
  '@add-terminal': { kind: 'menu', icon: <SatelliteDishIcon sx={{ fontSize: 15 }} />, label: 'Add Terminal', name: 'Add Terminal' },
  '@add-kit': { kind: 'menu', icon: <RouterIcon sx={{ fontSize: 15 }} />, label: 'Add Kit', name: 'Add Kit' },
  '@add-net': { kind: 'menu', icon: <SettingsInputAntennaIcon sx={{ fontSize: 15 }} />, label: 'Add Net', name: 'Add Net' },
};

/**
 * Buttons that carry only words. Listed rather than tokenised in the content,
 * because they read correctly as their own text and the content is easier to
 * follow with the literal label in it.
 */
const BUTTON_STEPS = new Set([
  'Save',
  'Save Section',
  'Save Changes',
  'Delete',
  'Download CSV',
  'Download template',
  'Print / Save PDF',
  'Add Terminal',
  'Add Kit',
  'Add Net',
  'Create',
  'Edit',
  'Upload Photo',
  'Move terminals & delete',
  'Take me there',

  // The library and editor add buttons, which carry a literal leading "+".
  // Every one of these was a live step rendering as plain words, including
  // "+ Add to Waveform Library" - the label help.md uses as the example of this rule.
  // `help-content.test.ts` now fails any step starting with "+ " that is
  // missing here, because this list is the kind that only grows.
  '+ SATCOM',
  '+ Add to Waveform Library',
  '+ Add to Service Library',
  '+ Add to Transport Library',
  '+ Add to Platform Library',
]);

function specFor(step: string): StepSpec {
  return STEP_SPECS[step] ?? { kind: BUTTON_STEPS.has(step) ? 'button' : 'text', label: step, name: step };
}

function gatePasses(
  gate: HelpTopic['gate'],
  auth: { isAdmin: boolean; canWrite: boolean; canWriteRadio: boolean; canWritePace: boolean },
): boolean {
  switch (gate) {
    case undefined:
      return true;
    case 'isAdmin':
      return auth.isAdmin;
    case 'canWrite':
      return auth.canWrite;
    case 'canWriteRadio':
      return auth.canWriteRadio;
    case 'canWritePace':
      return auth.canWritePace;
    default:
      return false;
  }
}

/**
 * The in-app FAQ. Always mounted with `open` fixed to `true` - `HelpButton`
 * mounts and unmounts this component instead of toggling an `open` prop, so
 * every piece of state below (the search term, which groups and topics are
 * expanded) starts fresh on every open rather than surviving a close.
 */
export function HelpDialog({ onClose }: HelpDialogProps) {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'));
  const navigate = useNavigate();

  const [search, setSearch] = useState('');
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [expandedTopics, setExpandedTopics] = useState<Set<string>>(new Set());

  const term = search.trim().toLowerCase();
  const searching = term !== '';

  const visibleGroups = useMemo(
    () =>
      HELP_GROUPS.map((group) => ({
        ...group,
        topics: searching ? group.topics.filter((topic) => matchesSearch(topic, term)) : group.topics,
      })).filter((group) => group.topics.length > 0),
    [term, searching],
  );

  const toggleGroup = (id: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleTopic = (id: string) => {
    setExpandedTopics((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const goToRoute = (route: string) => {
    onClose();
    void navigate(route);
  };

  return (
    <Dialog open onClose={onClose} maxWidth="md" fullWidth fullScreen={fullScreen}>
      {/* "Need help?" - and the reasoning here inverted once the button lost
          its words. This deliberately avoided saying "I need help!" a second
          time while the control was a labelled pill, because a dialog opening
          with the sentence you just clicked spends its most-read line telling
          you what you knew. The control is now a bare `?`, so nothing has been
          said yet and the dialog is the only thing that can name itself. */}
      {/* pb here and pt on DialogContent below are a pair, and halving both is
          the point. MUI's defaults put 16px under the title and another 16px
          over the content, so 33px of air stacked above the search box against
          16px below it - each gap defensible alone, but the divider between
          them is a hairline the eye reads straight through, so it lands as one
          oversized gap. 8 and 8 puts the search the same distance from the
          subtitle as it is from the first group. */}
      <DialogTitle
        component="div"
        sx={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 2,
          pb: 1,
        }}
      >
        <Box>
          <Typography variant="h6" component="h2" sx={{ fontWeight: 600, lineHeight: 1.3 }}>
            Need help?
          </Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>
            A collection of the things people most often need to do in the app, and what to do
            when one of them will not work.
          </Typography>
        </Box>
        <IconButton aria-label="close help" onClick={onClose} size="small" sx={{ flexShrink: 0 }}>
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent dividers sx={{ pt: 1 }}>
        <TextField
          autoFocus
          size="small"
          fullWidth
          placeholder="Search help..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" sx={{ color: 'text.secondary' }} />
                </InputAdornment>
              ),
            },
          }}
          sx={{ mb: 2 }}
        />

        {visibleGroups.length === 0 && (
          <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>
            Nothing matches that. Try a shorter word.
          </Typography>
        )}

        {visibleGroups.map((group) => {
          const expanded = searching || expandedGroups.has(group.id);
          return (
            <Accordion
              key={group.id}
              expanded={expanded}
              onChange={() => toggleGroup(group.id)}
              slotProps={{ transition: { unmountOnExit: true } }}
            >
              {/*
                Amber on the GROUP arrow, muted on the topic arrows below.
                These are nested accordions, so an open group stacks its own
                chevron on top of five or six identical ones and the only one
                that closes the group is indistinguishable from the rest.

                This does not contradict the "emphasis is typographic, never
                chromatic" rule in help.md - that rule is about the topic
                NOTES, and its argument is that amber already means "this is
                the app's own chrome" and so cannot also mean danger. An
                accordion arrow IS chrome, so amber here spends the token on
                exactly what it already means.
              */}
              <AccordionSummary expandIcon={<ExpandMoreIcon sx={{ color: 'var(--shf-amber)' }} />}>
                <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                  {group.title}
                </Typography>
              </AccordionSummary>
              <AccordionDetails sx={{ display: 'block', p: 0 }}>
                {group.topics.map((topic) => (
                  <TopicRow
                    key={topic.id}
                    topic={topic}
                    expanded={expandedTopics.has(topic.id)}
                    onToggle={() => toggleTopic(topic.id)}
                    onNavigate={goToRoute}
                  />
                ))}
              </AccordionDetails>
            </Accordion>
          );
        })}
      </DialogContent>
    </Dialog>
  );
}

interface TopicRowProps {
  topic: HelpTopic;
  expanded: boolean;
  onToggle: () => void;
  onNavigate: (route: string) => void;
}

function TopicRow({ topic, expanded, onToggle, onNavigate }: TopicRowProps) {
  const auth = useAuth();
  const showButton = topic.route !== undefined && gatePasses(topic.gate, auth);

  return (
    <Accordion
      disableGutters
      square
      expanded={expanded}
      onChange={onToggle}
      slotProps={{ transition: { unmountOnExit: true } }}
      sx={{ boxShadow: 'none', '&:before': { display: 'none' }, borderTop: 1, borderColor: 'divider' }}
    >
      {/* Same token as the step separator chevrons below, so the two kinds of
          "not the thing you are reading" agree. See the group summary above. */}
      <AccordionSummary expandIcon={<ExpandMoreIcon sx={{ color: 'text.disabled' }} />}>
        <Typography variant="body2">{topic.question}</Typography>
      </AccordionSummary>
      <AccordionDetails>
        {topic.steps && (
          <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 0.5, mb: 1.5 }}>
            {topic.steps.map((step, i) => {
              const spec = specFor(step);
              return (
                <Box
                  key={`${topic.id}-step-${String(i)}`}
                  sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}
                >
                  {i > 0 && (
                    <ChevronRightIcon
                      fontSize="small"
                      sx={{ color: 'text.disabled', opacity: 0.9 }}
                    />
                  )}
                  {spec.kind === 'button' ? (
                    // A real button, so a real box - white on a neutral
                    // border, matching the outlined controls it depicts. Not
                    // primary blue: nothing in this app's chrome is blue, so a
                    // blue box was a picture of a control that does not exist.
                    <Box
                      component="span"
                      aria-label={spec.label ? undefined : spec.name}
                      sx={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 0.5,
                        px: 0.85,
                        py: 0.3,
                        borderRadius: '4px',
                        border: '1px solid',
                        borderColor: 'divider',
                        bgcolor: (t) => alpha(t.palette.common.white, 0.06),
                        color: 'text.primary',
                        fontSize: 13,
                        fontWeight: 600,
                        lineHeight: 1.4,
                      }}
                    >
                      {spec.icon}
                      {spec.label}
                    </Box>
                  ) : (
                    // Menu rows and plain words both render unboxed. A menu row
                    // keeps its icon, because that is what is on screen beside
                    // its label; a field name or a placeholder gets neither.
                    <Box
                      component="span"
                      sx={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 0.5,
                        color: 'text.primary',
                        fontSize: 13,
                        fontWeight: spec.kind === 'menu' ? 600 : 400,
                        lineHeight: 1.4,
                      }}
                    >
                      {spec.icon}
                      {spec.label}
                    </Box>
                  )}
                </Box>
              );
            })}
          </Box>
        )}

        {topic.showRoleTable && <RoleTable currentRole={auth.role} />}

        {/* Every note is body colour. Emphasis is typographic, never chromatic.
            `caution` now renders italic.

            Amber was tried for it and was the wrong instrument twice over.
            First by coverage: 10 of 26 notes carried the flag, and a colour on
            a third of the file distinguishes nothing - the dialog just read as
            arbitrary white and yellow text. Then by what it marked, which was
            mostly *permissions*, the commonest kind of note here and the one
            already stated by the `Who:` chips a line below.

            But the deciding reason is that `--shf-amber` is this app's house
            accent - page banners, section headings, the wheel ring, the Add
            controls. A colour that already means "this is the app's own chrome"
            cannot also mean "danger", however sparingly it is used. So the flag
            is kept and its rendering changed; it is now reserved for a handful
            of notes about something destroyed or refused.

            Italic rather than an asterisk: an asterisk promises a footnote this
            dialog does not have, and reads oddly beside the `>` step chips. */}
        {topic.note && (
          <Box sx={{ mb: 1.5, pl: 1.25, borderLeft: 2, borderColor: 'divider' }}>
            <Typography
              variant="body2"
              sx={{
                color: 'text.primary',
                fontStyle: topic.tone === 'caution' ? 'italic' : 'normal',
              }}
            >
              {topic.note}
            </Typography>
          </Box>
        )}

        <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 0.75, mb: showButton ? 1.5 : 0 }}>
          <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 700 }}>
            Who:
          </Typography>
          {topic.roles === 'all' ? (
            <Typography variant="body2" sx={{ color: 'success.main', fontWeight: 600 }}>
              Anyone signed in
            </Typography>
          ) : (
            topic.roles.map((r) => <RoleBadge key={r} role={r} size="sm" />)
          )}
        </Box>

        {showButton && (
          <Button size="small" variant="outlined" onClick={() => onNavigate(topic.route as string)}>
            Take me there
          </Button>
        )}
      </AccordionDetails>
    </Accordion>
  );
}

function RoleTable({ currentRole }: { currentRole: string | null }) {
  return (
    <Table size="small" sx={{ mb: 1.5 }}>
      <TableHead>
        <TableRow>
          <TableCell>Role</TableCell>
          <TableCell>What it grants</TableCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {ROLE_OPTIONS.map((opt) => {
          const isCurrent = opt.value === currentRole;
          return (
            <TableRow
              key={opt.value}
              sx={isCurrent ? { bgcolor: (t) => alpha(t.palette.primary.main, 0.1) } : undefined}
            >
              <TableCell sx={{ fontWeight: isCurrent ? 600 : 400 }}>
                {opt.label}
                {isCurrent && ' (you)'}
              </TableCell>
              <TableCell>{opt.description}</TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
