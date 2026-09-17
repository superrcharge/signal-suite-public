import { useMemo } from 'react';
import {
  Box,
  Checkbox,
  Divider,
  FormControlLabel,
  MenuItem,
  TextField,
  Typography,
} from '@mui/material';

import { columnsFor } from '../csv-labels';
import { ChecklistGrid, ChecklistOption, OPTION_ROW_H, Section, ToggleAll } from './csv-checklist';
import { CSV_DOMAINS, type CsvFacetOption, type CsvFacetParam, type CsvResource } from './csv-domains';
import { modeColumnsFor, squadronsFor, type CsvMode, type DatasetSelection } from './csv-selection';
import type { CsvFacetOptions } from './use-csv-facet-options';

interface CsvDatasetPanelProps {
  resource: CsvResource;
  mode: CsvMode;
  state: DatasetSelection;
  options: CsvFacetOptions;
  onChange: (next: DatasetSelection) => void;
  /**
   * Hides the squadron dropdown. The single-dataset call sites are opened from a
   * page that already knows which squadron it is looking at, so asking again
   * would let the user pick a different one than the page they came from.
   */
  lockedSection?: boolean;
}

/**
 * One dataset's facets, squadron and columns.
 *
 * Extracted from the dialog when it went multi-dataset, and deliberately
 * stateless: the dialog owns the whole selection map so that "how many datasets
 * are selected" - which drives both the submit plan and which panel is expanded
 * - has exactly one owner.
 */
export function CsvDatasetPanel({
  resource,
  mode,
  state,
  options,
  onChange,
  lockedSection,
}: CsvDatasetPanelProps) {
  const config = CSV_DOMAINS[resource];
  const isTemplate = mode === 'template';

  const allColumns = useMemo(() => columnsFor(resource), [resource]);
  const modeColumns = useMemo(() => modeColumnsFor(resource, mode), [resource, mode]);
  const requiredKeys = useMemo(
    () => new Set(modeColumns.filter((c) => c.required).map((c) => c.key)),
    [modeColumns],
  );
  const squadrons = squadronsFor(resource, options);

  const droppedForTemplate = isTemplate
    ? allColumns.filter((c) => !c.templatable && state.columns.includes(c.key))
    : [];

  const allSelected = modeColumns.every((c) => state.columns.includes(c.key));
  const someSelected = modeColumns.some((c) => state.columns.includes(c.key));

  const setColumns = (columns: string[]) => onChange({ ...state, columns });
  const setFacet = (param: CsvFacetParam, values: string[]) =>
    onChange({ ...state, facets: { ...state.facets, [param]: values } });

  return (
    <Box>
      {/* Facets are meaningless for a template: it has no rows to filter. */}
      {!isTemplate &&
        config.facets.map((facet) => {
          const facetOptions = options.byParam[facet.param] ?? [];
          // A facet with nothing in it renders nothing, which is how contracts
          // with no fiscal years behaves without a special case.
          if (facetOptions.length === 0) return null;
          const chosen = state.facets[facet.param] ?? [];
          const allOn = chosen.length === facetOptions.length;

          return (
            <Box key={facet.param} sx={{ mb: 2 }}>
              <Section title={facet.title}>
                <ToggleAll
                  checked={allOn}
                  indeterminate={chosen.length > 0 && !allOn}
                  onChange={() =>
                    setFacet(facet.param, allOn ? [] : facetOptions.map((o) => o.value))
                  }
                />
                <ChecklistGrid>
                  {facetOptions.map((option) => (
                    <ChecklistOption
                      key={option.value}
                      checked={chosen.includes(option.value)}
                      onChange={() =>
                        setFacet(
                          facet.param,
                          chosen.includes(option.value)
                            ? chosen.filter((v) => v !== option.value)
                            : [...chosen, option.value],
                        )
                      }
                      label={<FacetLabel option={option} />}
                    />
                  ))}
                </ChecklistGrid>
              </Section>
              <Divider sx={{ mt: 2 }} />
            </Box>
          );
        })}

      {squadrons.length > 0 && !lockedSection && (
        <Box sx={{ mb: 2 }}>
          <Section title="Squadron">
            <TextField
              select
              size="small"
              fullWidth
              value={state.section ?? ''}
              onChange={(e) => onChange({ ...state, section: e.target.value })}
              helperText={
                state.section
                  ? undefined
                  : `${config.label} is per squadron - pick one to include it.`
              }
              error={!state.section}
            >
              {squadrons.map((s) => (
                <MenuItem key={s.value} value={s.value}>
                  {s.label}
                </MenuItem>
              ))}
            </TextField>
          </Section>
          <Divider sx={{ mt: 2 }} />
        </Box>
      )}

      <Section title="Columns">
        <ToggleAll
          checked={allSelected}
          indeterminate={someSelected && !allSelected}
          onChange={() => setColumns(allSelected ? [...requiredKeys] : modeColumns.map((c) => c.key))}
        />
        <ChecklistGrid wide>
          {modeColumns.map((column) => {
            const required = requiredKeys.has(column.key);
            return (
              <FormControlLabel
                key={column.key}
                control={
                  <Checkbox
                    size="small"
                    // Required columns are checked and locked: a template
                    // without one produces a file that cannot be imported.
                    checked={required || state.columns.includes(column.key)}
                    disabled={required}
                    onChange={() =>
                      setColumns(
                        state.columns.includes(column.key)
                          ? state.columns.filter((k) => k !== column.key)
                          : [...state.columns, column.key],
                      )
                    }
                  />
                }
                label={
                  <Typography variant="body2" sx={{ fontSize: 13, lineHeight: 1.25 }}>
                    {column.label}
                    {required && (
                      <Typography component="span" variant="caption" sx={{ color: 'text.secondary', ml: 0.5 }}>
                        required
                      </Typography>
                    )}
                  </Typography>
                }
                // Not ChecklistOption: this one needs `disabled`, which that
                // component does not take. Same height by the shared constant
                // rather than by a copied number.
                sx={{ m: 0, height: OPTION_ROW_H, '& .MuiCheckbox-root': { p: 0.75 } }}
              />
            );
          })}
        </ChecklistGrid>
      </Section>

      {droppedForTemplate.length > 0 && (
        <Typography variant="caption" sx={{ display: 'block', mt: 1.5, color: 'text.secondary' }}>
          {droppedForTemplate.map((c) => c.label).join(', ')}{' '}
          {droppedForTemplate.length === 1 ? 'is' : 'are'} set by the server and cannot be imported,
          so {droppedForTemplate.length === 1 ? 'it is' : 'they are'} left out of the template.
        </Typography>
      )}
    </Box>
  );
}

function FacetLabel({ option }: { option: CsvFacetOption }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
      {option.color && (
        <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: option.color, flexShrink: 0 }} />
      )}
      <Typography variant="body2">{option.label}</Typography>
    </Box>
  );
}
