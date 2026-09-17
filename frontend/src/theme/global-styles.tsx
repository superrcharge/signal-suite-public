import { GlobalStyles as MuiGlobalStyles } from '@mui/material';
import { useTheme } from '@mui/material/styles';

// The fonts, the graphite ramp and the print rules, loaded once for the whole
// app rather than by whichever page happens to import them. This component is
// mounted by `contexts/theme-context.tsx` on every route, so the sheet is
// unconditional here; it used to arrive only through the pages that imported
// it, which meant `theme.typography.fontFamily` could name a family that was
// not loaded on the route being rendered. Same reasoning as the import in
// `components/common/page-banner.tsx`, applied one level up.
import '@/styles/catalog-tokens.css';

/** The styled scrollbar's width. #main-content carries one, so anything meant to line up with content inside it from outside (the header) adds this. */
export const SCROLLBAR_W = 8;

export function GlobalStyles() {
  const theme = useTheme();

  return (
    <MuiGlobalStyles
      styles={{
        // The amber scale as CSS custom properties, read from the palette so
        // the two cannot drift. They lived only in catalog-tokens.css, which
        // is imported per page, so the shell could not reference them; here
        // they exist on every route. --shf-amber-deep has no palette slot.
        ':root': {
          '--shf-amber': theme.palette.primary.main,
          '--shf-amber-bright': theme.palette.primary.light,
          '--shf-amber-dim': theme.palette.primary.dark,
          '--shf-amber-deep': '#8A5A12',
        },
        // Custom scrollbar
        '*::-webkit-scrollbar': {
          width: `${String(SCROLLBAR_W)}px`,
          height: `${String(SCROLLBAR_W)}px`,
        },
        '*::-webkit-scrollbar-track': {
          backgroundColor: theme.palette.background.default,
        },
        '*::-webkit-scrollbar-thumb': {
          backgroundColor: theme.palette.grey[400],
          borderRadius: '4px',
          '&:hover': {
            backgroundColor: theme.palette.grey[600],
          },
        },
        // Selection color
        '::selection': {
          backgroundColor: theme.palette.primary.light,
          color: theme.palette.primary.contrastText,
        },
        // Focus visible outline
        '*:focus-visible': {
          outline: `2px solid ${theme.palette.primary.main}`,
          outlineOffset: '2px',
        },
        // Smooth scrolling
        html: {
          scrollBehavior: 'smooth',
        },
        // Body defaults
        body: {
          margin: 0,
          padding: 0,
          minHeight: '100vh',
          backgroundColor: theme.palette.background.default,
        },
        // Root element
        '#root': {
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
        },
        // Skip link for accessibility
        '.skip-link': {
          position: 'absolute',
          left: '-9999px',
          top: '0',
          zIndex: 9999,
          padding: theme.spacing(1, 2),
          backgroundColor: theme.palette.background.paper,
          color: theme.palette.text.primary,
          textDecoration: 'none',
          '&:focus': {
            left: '0',
          },
        },
      }}
    />
  );
}
