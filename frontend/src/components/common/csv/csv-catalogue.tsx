import { Box, Divider, Typography } from '@mui/material';

import { CSV_DOMAINS, CSV_DOMAIN_ORDER } from './csv-domains';
import { CsvToolbar } from './csv-toolbar';

/**
 * Every CSV dataset in one list, for the Settings page.
 *
 * The app-wide controls are CsvHeaderControls, in the header on every route.
 * This list is the other thing: a place to *discover* that an export exists at
 * all, with each domain's description next to it. Adding domain ten is a
 * registry row rather than a new panel.
 *
 * The section-scoped domains are absent because a row here names one domain and
 * has nowhere to name a squadron, and CsvToolbar's Import posts to a path still
 * carrying `:section`. The header controls cover them: their dialogs ask which
 * squadron. Including nets and PACE here would mean giving this list a squadron
 * picker per row, which is the header dialog rebuilt in a worse place.
 */
export function CsvCatalogue() {
  const rows = CSV_DOMAIN_ORDER.map((r) => CSV_DOMAINS[r]).filter((c) => !c.sectionScoped);

  return (
    <Box>
      {rows.map((config, index) => (
        <Box key={config.resource}>
          {index > 0 && <Divider sx={{ my: 1.5 }} />}
          <Box
            sx={{
              display: 'flex',
              alignItems: { xs: 'flex-start', sm: 'center' },
              justifyContent: 'space-between',
              flexDirection: { xs: 'column', sm: 'row' },
              gap: 1,
            }}
          >
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                {config.label}
              </Typography>
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                {config.description}
              </Typography>
            </Box>
            <CsvToolbar resource={config.resource} />
          </Box>
        </Box>
      ))}
    </Box>
  );
}
