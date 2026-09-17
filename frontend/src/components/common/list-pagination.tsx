import { Box, IconButton, Tooltip, Typography } from '@mui/material';
import NavigateBeforeIcon from '@mui/icons-material/NavigateBefore';
import NavigateNextIcon from '@mui/icons-material/NavigateNext';

/**
 * The footer of a paged list: page-size options and prev/next on the left,
 * the row count on the right.
 *
 * It lives under the table, not in the toolbar, for two reasons. Reaching
 * the end of the list is when the next-page control is wanted, so that is
 * where a reader naturally finds it. And the toolbar wraps: on Terminals at
 * 1280px with the sidebar open, the search field, scope switch and eight
 * variant chips filled the row and pushed the paging cluster onto a line of
 * its own, under the chips, looking like a layout fault. A footer has the
 * whole width and wraps nothing.
 *
 * Terminals, Kits and Contracts each carried their own copy of the prev/next
 * block, and the first two their own copy of the page-size row, in both the
 * toolbar and the table footer. This is the one definition.
 *
 * `pageSizeOptions` is optional because Contracts pages at a fixed size with
 * no picker. `0` in the list means "all rows", matching the API's `limit=0`.
 */
export interface ListPaginationProps {
  /** Row count across all pages. */
  total: number;
  /** Singular noun for the count: "terminal", "kit", "contract". */
  noun: string;
  page: number;
  totalPages: number;
  onPrev: () => void;
  onNext: () => void;
  pageLimit?: number;
  pageSizeOptions?: readonly number[];
  onPageLimitChange?: (limit: number) => void;
}

const Rule = () => <Box sx={{ width: '1px', height: 14, bgcolor: 'divider', flexShrink: 0 }} />;

export function ListPagination({
  total, noun, page, totalPages, onPrev, onNext, pageLimit, pageSizeOptions, onPageLimitChange,
}: ListPaginationProps) {
  const hasSizes = !!pageSizeOptions && !!onPageLimitChange;
  const hasPages = total > 0;
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, px: 2, py: 1.25, borderTop: 1, borderColor: 'divider' }}>
      {hasSizes && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }} aria-label="Rows per page">
          <Typography variant="body2" sx={{ color: 'text.disabled', mr: 0.5, fontSize: 12 }}>per page</Typography>
          {pageSizeOptions.map((n, i) => (
            <Box key={n} sx={{ display: 'flex', alignItems: 'center' }}>
              {i > 0 && (
                <Typography sx={{ mx: 0.5, fontSize: 12, color: 'text.disabled', userSelect: 'none' }}>·</Typography>
              )}
              <Typography
                component="button"
                onClick={() => onPageLimitChange(n)}
                aria-pressed={pageLimit === n}
                sx={{
                  cursor: 'pointer',
                  background: 'none',
                  border: 'none',
                  p: 0,
                  fontSize: 12,
                  fontWeight: pageLimit === n ? 700 : 400,
                  textDecoration: pageLimit === n ? 'underline' : 'none',
                  textUnderlineOffset: '3px',
                  color: pageLimit === n ? 'text.primary' : 'text.secondary',
                  '&:hover': { color: 'text.primary' },
                }}
              >
                {n === 0 ? 'All' : String(n)}
              </Typography>
            </Box>
          ))}
        </Box>
      )}
      {hasSizes && hasPages && <Rule />}
      {hasPages && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <Tooltip title="Previous page">
            <span>
              <IconButton size="small" onClick={onPrev} disabled={page <= 1} aria-label="previous page">
                <NavigateBeforeIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
          <Typography variant="body2" sx={{ color: 'text.secondary', whiteSpace: 'nowrap' }}>
            {page} / {totalPages}
          </Typography>
          <Tooltip title="Next page">
            <span>
              <IconButton size="small" onClick={onNext} disabled={page >= totalPages} aria-label="next page">
                <NavigateNextIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
        </Box>
      )}
      <Typography variant="body2" sx={{ ml: 'auto', color: 'text.secondary', whiteSpace: 'nowrap' }}>
        {total} {noun}{total !== 1 ? 's' : ''}
      </Typography>
    </Box>
  );
}
