import { Box, ToggleButtonGroup, ToggleButton } from '@mui/material';
import { useNavigate, useSearchParams } from 'react-router';
import { useTerminals, useKits } from '@/services';

type Scope = 'terminals' | 'kits';

// Params that mean the same thing on both pages and should survive a scope
// switch. Everything else is either entity-specific (model, tag, type) or
// drawer state pointing at a record the other page cannot resolve. `search` is
// handled separately - it lives in page state, so the live prop is the truth,
// not whatever ?search= the page was originally opened with.
const SHARED_PARAMS = ['sections', 'status', 'limit'] as const;

// Same threshold both pages use before sending a search to the server.
const MIN_SEARCH = 2;

// Matches the model/type filter groups either page renders alongside this one.
const TOGGLE_SX = {
  '& .MuiToggleButton-root': {
    px: 1.5,
    height: 40,
    fontSize: 12,
    fontWeight: 600,
    textTransform: 'none',
    border: '1px solid',
    borderColor: 'divider',
  },
};

interface ScopeToggleProps {
  active: Scope;
  search?: string;
  terminalCount?: number;
  kitCount?: number;
}

function CountLabel({ label, count }: { label: string; count?: number }) {
  return (
    <>
      {label}
      {count != null && (
        <Box
          component="span"
          sx={{ ml: 0.75, color: 'text.secondary', fontVariantNumeric: 'tabular-nums' }}
        >
          {count}
        </Box>
      )}
    </>
  );
}

function ScopeToggle({ active, search, terminalCount, kitCount }: ScopeToggleProps) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const handleChange = (_: unknown, next: Scope | null) => {
    if (next === null || next === active) return;
    const params = new URLSearchParams();
    for (const key of SHARED_PARAMS) {
      const value = searchParams.get(key);
      if (value !== null) params.set(key, value);
    }
    if (search && search.length >= MIN_SEARCH) params.set('search', search);
    const qs = params.toString();
    void navigate(`/${next}${qs ? `?${qs}` : ''}`);
  };

  return (
    <ToggleButtonGroup
      exclusive
      value={active}
      onChange={handleChange}
      size="small"
      aria-label="Asset type"
      sx={TOGGLE_SX}
    >
      <ToggleButton value="terminals">
        <CountLabel label="Terminals" count={terminalCount} />
      </ToggleButton>
      <ToggleButton value="kits">
        <CountLabel label="Kits" count={kitCount} />
      </ToggleButton>
    </ToggleButtonGroup>
  );
}

interface ScopeQueryProps {
  sections?: string;
  search?: string;
  count: number;
}

// Split so only the counterpart list is fetched - the host page already knows
// its own total, and hooks cannot be called conditionally. `limit: 1` keeps the
// payload to a single row; only `total` is read.
function TerminalsScope({ sections, search, count }: ScopeQueryProps) {
  const { data } = useKits({ sections, search, limit: 1 });
  return (
    <ScopeToggle active="terminals" search={search} terminalCount={count} kitCount={data?.total} />
  );
}

function KitsScope({ sections, search, count }: ScopeQueryProps) {
  const { data } = useTerminals({ sections, search, limit: 1 });
  return (
    <ScopeToggle active="kits" search={search} kitCount={count} terminalCount={data?.total} />
  );
}

export interface ScopeSwitchProps {
  /** Which list the host page is showing. */
  active: Scope;
  /** The host page's own server total, so it is not re-fetched. */
  count: number;
  /** The host page's debounced search term, so the other side's count reflects it. */
  search?: string;
}

/**
 * Terminals ⇄ Kits switch for the list toolbars. Carries the section filter
 * (and the other shared params) across the route change, so a section
 * drill-down can show either asset type.
 */
export function ScopeSwitch({ active, count, search }: ScopeSwitchProps) {
  const [searchParams] = useSearchParams();
  const sections = searchParams.get('sections') || undefined;
  const query = search && search.length >= MIN_SEARCH ? search : undefined;

  return active === 'terminals' ? (
    <TerminalsScope sections={sections} search={query} count={count} />
  ) : (
    <KitsScope sections={sections} search={query} count={count} />
  );
}
