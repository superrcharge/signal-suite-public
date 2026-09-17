import { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  CircularProgress,
  Collapse,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControlLabel,
  IconButton,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import FileDownloadIcon from '@mui/icons-material/FileDownload';

import { columnsFor } from '../csv-labels';
import { OPTION_ROW_H, Section, ToggleAll } from './csv-checklist';
import { CsvDatasetPanel } from './csv-dataset-panel';
import { CSV_DOMAINS, CSV_DOMAIN_ORDER, type CsvResource } from './csv-domains';
import {
  effectiveColumnsFor,
  emptyFacets,
  planCsvRequest,
  squadronsFor,
  type DatasetSelection,
  type SelectionMap,
} from './csv-selection';
import { CsvDownloadError, downloadCsv } from './download-csv';
import { useCsvFacetOptions, type CsvFacetOptions } from './use-csv-facet-options';

export type CsvDialogMode = 'export' | 'template';

interface CsvDialogProps {
  /**
   * Locks the dialog to exactly one dataset, with no dataset picker.
   *
   * This is what the Settings catalogue passes: each row there is already
   * labelled with its domain, so offering the other eight inside it would be
   * asking the same question twice. The header controls pass `preselect`
   * instead and get the full picker.
   */
  resource?: CsvResource;
  /** Pre-ticked dataset when the picker is shown. Ignored alongside `resource`. */
  preselect?: CsvResource;
  /** Which mode to open in. The dialog owns it afterwards. */
  mode: CsvDialogMode;
  onClose: () => void;
  /** The squadron, for the section-scoped domains (nets, pace-channels). */
  section?: string;
}

/**
 * One dialog for every CSV domain, in two modes, for one dataset or several.
 *
 * There is no `open` prop on purpose. Call sites render `{active && <CsvDialog/>}`,
 * which fixes three things the three predecessor dialogs each had: defaults can
 * come from useState initialisers instead of a render-phase setState, the facet
 * queries only run while the dialog is open rather than on every route, and
 * "mounted twice with independent state" stops being expressible.
 *
 * One dataset produces the same plain GET it always has; two or more produce a
 * zip. That rule lives in planCsvRequest rather than here, so it is a unit test
 * rather than a rendering test.
 */
export function CsvDialog({
  resource,
  preselect,
  mode: initialMode,
  onClose,
  section,
}: CsvDialogProps) {
  const locked = resource !== undefined;
  const options = useCsvFacetOptions();

  // The dialog is the tallest thing in the app: the Terminals panel alone puts
  // 45 checkboxes and four group headings into one scroll. `md` rather than
  // `sm` is what lets ChecklistGrid's auto-fill reach three columns, and going
  // full screen below `sm` is the only way the panel is reachable on a phone -
  // the same pair help-dialog.tsx uses.
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'));

  const [mode, setMode] = useState<CsvDialogMode>(initialMode);
  const [selection, setSelection] = useState<SelectionMap>(() => {
    const start = resource ?? preselect;
    return start ? { [start]: freshSelection(start, options, section) } : {};
  });
  // null means "follow the selection": one dataset selected expands itself.
  const [expandOverride, setExpandOverride] = useState<CsvResource | null>(null);

  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isTemplate = mode === 'template';

  /** Datasets this mode can produce anything for. */
  const availableInMode = (r: CsvResource) => !isTemplate || Boolean(CSV_DOMAINS[r].templatePath);

  const chosen = CSV_DOMAIN_ORDER.filter((r) => selection[r]?.selected && availableInMode(r));

  // Expanded without a useEffect: derived, with an explicit override that a
  // click sets. An effect syncing "expand the only selected one" would fight
  // the user the moment they collapsed it.
  const expanded = expandOverride ?? (chosen.length === 1 ? chosen[0]! : null);

  // Columns are stored as the user ticked them; this is what will be sent, with
  // the mode's narrowing and the required columns applied. Not memoised: every
  // input already changes on the renders that matter, so a memo would only add
  // a dependency list to get wrong.
  const planned = planCsvRequest(mode, effectiveSelection(chosen, selection, mode), options.byParam);

  // A section-scoped dataset with no squadron would render a URL still carrying
  // ":section", which 404s. Caught here rather than by the server so the message
  // names the dataset.
  //
  // A squadron the dataset does not accept counts as missing too: Nets takes any
  // section, PACE only the ones that run a card, so /pace of a squadron whose
  // card was switched off in Settings must not export nothing and call it a
  // file. Checked against the same list the dropdown is built from, so the two
  // cannot disagree - and skipped while that list is empty, because "not in an
  // empty list" means the query has not answered, not that it was rejected.
  const missingSquadron = chosen.filter((r) => {
    if (!CSV_DOMAINS[r].sectionScoped) return false;
    const picked = selection[r]?.section;
    if (!picked) return true;
    const accepted = squadronsFor(r, options);
    return accepted.length > 0 && !accepted.some((s) => s.value === picked);
  });

  // A facet with nothing ticked cannot be turned into a request: an empty
  // filter and an absent one are the same URL, so submitting would have handed
  // back a full export while looking filtered. Refused rather than guessed at.
  // Templates carry no rows and so no facets, hence the mode check.
  const emptied = isTemplate ? [] : emptyFacets(chosen, selection);

  const canSubmit =
    planned !== null && missingSquadron.length === 0 && emptied.length === 0 && !isBusy;

  const setDataset = (r: CsvResource, next: DatasetSelection) =>
    setSelection((prev) => ({ ...prev, [r]: next }));

  const toggleDataset = (r: CsvResource) => {
    const turningOn = !selection[r]?.selected;
    // Ticking a dataset opens it. One dataset selected already expanded itself
    // through `expanded` below, but from the second onward nothing opened until
    // the chevron was found - and for Nets and PACE the squadron dropdown lives
    // inside that panel, so the control the dialog then insists on was hidden.
    // Set as an override rather than derived: a click is exactly the explicit
    // action the override exists for.
    setExpandOverride(turningOn ? r : (prev) => (prev === r ? null : prev));
    setSelection((prev) => {
      const current = prev[r];
      if (current?.selected) return { ...prev, [r]: { ...current, selected: false } };
      // Re-ticking keeps whatever columns and facets were chosen before.
      return {
        ...prev,
        [r]: current
          ? { ...current, selected: true }
          : freshSelection(r, options, section),
      };
    });
  };

  const selectableInMode = CSV_DOMAIN_ORDER.filter(availableInMode);
  const allDatasetsOn = selectableInMode.every((r) => selection[r]?.selected);
  const someDatasetsOn = selectableInMode.some((r) => selection[r]?.selected);

  const toggleAllDatasets = () => {
    setExpandOverride(null);
    setSelection((prev) => {
      const next: SelectionMap = { ...prev };
      for (const r of selectableInMode) {
        const current = next[r];
        if (allDatasetsOn) {
          if (current) next[r] = { ...current, selected: false };
        } else {
          next[r] = current
            ? { ...current, selected: true }
            : freshSelection(r, options, section);
        }
      }
      return next;
    });
  };

  const handleSubmit = async () => {
    if (!planned) return;

    setIsBusy(true);
    setError(null);
    try {
      await downloadCsv(
        planned.url,
        planned.filename,
        planned.kind === 'bundle'
          ? {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(planned.body),
            }
          : undefined,
      );
      onClose();
    } catch (err) {
      // A CsvDownloadError already carries either the server's message or the
      // status. Anything else is a thrown fetch or MSAL failure, and this
      // branch used to erase it - so a token that could not be acquired and a
      // server that refused the request read identically on screen.
      setError(
        err instanceof CsvDownloadError
          ? err.message
          : err instanceof Error && err.message
            ? `Download failed: ${err.message}`
            : 'Download failed. Please try again.',
      );
    } finally {
      setIsBusy(false);
    }
  };

  const title = locked
    ? `${isTemplate ? 'Import template' : 'Export'}: ${CSV_DOMAINS[resource].label}`
    : isTemplate
      ? 'Import templates'
      : 'Export';

  // Locked to a domain with no template, there is nothing to toggle between.
  const showModeToggle = locked ? Boolean(CSV_DOMAINS[resource].templatePath) : true;

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="md" fullScreen={fullScreen}>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2 }}>
        <span>{title}</span>
        {showModeToggle && (
          <ToggleButtonGroup
            size="small"
            exclusive
            value={mode}
            onChange={(_, next: CsvDialogMode | null) => next && setMode(next)}
          >
            <ToggleButton value="export">Export</ToggleButton>
            <ToggleButton value="template">Template</ToggleButton>
          </ToggleButtonGroup>
        )}
      </DialogTitle>

      <DialogContent dividers>
        {planned === null && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            {locked || someDatasetsOn ? 'Select at least one column.' : 'Select at least one dataset.'}
          </Alert>
        )}
        {missingSquadron.length > 0 && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            Pick a squadron for {missingSquadron.map((r) => CSV_DOMAINS[r].label).join(' and ')}.
          </Alert>
        )}
        {emptied.length > 0 && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            {/* Says which list, because with four of them on one panel
                "something is empty" sends the reader hunting. */}
            Nothing is ticked under{' '}
            {emptied
              .map((e) => `${CSV_DOMAINS[e.resource].label} ${e.titles.join(' and ')}`)
              .join(', ')}
            . Tick at least one, or use Select all to include them all.
          </Alert>
        )}
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {locked ? (
          <CsvDatasetPanel
            resource={resource}
            mode={mode}
            state={selection[resource] ?? freshSelection(resource, options, section)}
            options={options}
            onChange={(next) => setDataset(resource, next)}
            lockedSection
          />
        ) : (
          <>
            <Section title="Datasets">
              <ToggleAll
                checked={allDatasetsOn}
                indeterminate={someDatasetsOn && !allDatasetsOn}
                onChange={toggleAllDatasets}
              />
            </Section>

            {CSV_DOMAIN_ORDER.map((r) => {
              const config = CSV_DOMAINS[r];
              const usable = availableInMode(r);
              const on = Boolean(selection[r]?.selected) && usable;

              return (
                <Box key={r} sx={{ borderTop: 1, borderColor: 'divider' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <FormControlLabel
                      // Same row height as an option inside the panel. Nine of
                      // these sit above the panel and are pure navigation once
                      // a dataset is chosen, so they should not each cost more
                      // than a row of the content they lead to.
                      sx={{ flexGrow: 1, mr: 0, my: 0, minHeight: OPTION_ROW_H, '& .MuiCheckbox-root': { p: 0.75 } }}
                      control={
                        <Checkbox
                          size="small"
                          checked={on}
                          disabled={!usable}
                          onChange={() => toggleDataset(r)}
                        />
                      }
                      label={
                        <Typography variant="body2" sx={{ color: usable ? 'text.primary' : 'text.disabled' }}>
                          {config.label}
                          {!usable && (
                            <Typography component="span" variant="caption" sx={{ color: 'text.secondary', ml: 0.5 }}>
                              export only
                            </Typography>
                          )}
                        </Typography>
                      }
                    />
                    {on && (
                      <IconButton
                        size="small"
                        aria-label={`${expanded === r ? 'Hide' : 'Show'} ${config.label} columns`}
                        onClick={() => setExpandOverride(expanded === r ? null : r)}
                        sx={{
                          transform: expanded === r ? 'rotate(180deg)' : 'none',
                          transition: 'transform 150ms',
                        }}
                      >
                        <ExpandMoreIcon fontSize="small" />
                      </IconButton>
                    )}
                  </Box>

                  {/* Collapse, not Accordion: an Accordion brings its own Paper
                      into DialogContent and fights the Section styling. */}
                  <Collapse in={on && expanded === r} unmountOnExit>
                    <Box sx={{ pl: 4, pb: 2 }}>
                      <CsvDatasetPanel
                        resource={r}
                        mode={mode}
                        state={selection[r]!}
                        options={options}
                        onChange={(next) => setDataset(r, next)}
                      />
                    </Box>
                  </Collapse>
                </Box>
              );
            })}
            <Divider />
          </>
        )}
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose} disabled={isBusy}>
          Cancel
        </Button>
        <Button
          variant="contained"
          startIcon={isBusy ? <CircularProgress size={16} color="inherit" /> : <FileDownloadIcon />}
          onClick={() => void handleSubmit()}
          disabled={!canSubmit}
        >
          {isBusy
            ? 'Preparing…'
            : planned?.kind === 'bundle'
              ? `Download ZIP (${chosen.length})`
              : isTemplate
                ? 'Download template'
                : 'Download CSV'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/** A newly-ticked dataset starts with everything on, which is what both modes default to. */
function freshSelection(
  resource: CsvResource,
  options: CsvFacetOptions,
  section: string | undefined,
): DatasetSelection {
  const config = CSV_DOMAINS[resource];
  return {
    selected: true,
    columns: columnsFor(resource).map((c) => c.key),
    facets: Object.fromEntries(
      config.facets.map((f) => [f.param, (options.byParam[f.param] ?? []).map((o) => o.value)]),
    ),
    // A squadron only makes sense for the two section-scoped domains; carrying
    // the route's one onto Terminals would be meaningless. Whether it is one
    // this dataset accepts is checked at render time, not here - see
    // missingSquadron. This runs in a useState initialiser, where the sections
    // query may not have answered yet, and dropping a perfectly good squadron
    // because the list had not arrived would be worse than not checking.
    section: CSV_DOMAINS[resource].sectionScoped ? section : undefined,
  };
}

/** Applies each dataset's mode narrowing, leaving the stored ticks untouched. */
function effectiveSelection(
  chosen: CsvResource[],
  selection: SelectionMap,
  mode: CsvDialogMode,
): SelectionMap {
  const out: SelectionMap = {};
  for (const r of chosen) {
    const state = selection[r]!;
    out[r] = { ...state, columns: effectiveColumnsFor(r, mode, state.columns) };
  }
  return out;
}
