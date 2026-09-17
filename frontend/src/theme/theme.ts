import { createTheme, PaletteMode } from '@mui/material';


const getDesignTokens = (mode: PaletteMode) => ({
  palette: {
    mode,
    ...(mode === 'light'
      ? {
          // Light mode palette. Primary is the same amber as dark: the shell
          // publishes --shf-amber* from palette.primary, so a blue light
          // primary would turn every catalog chip and banner button blue the
          // day light mode is restored, while the lockup stayed amber.
          primary: {
            main: '#F5A21F',
            light: '#FFB935',
            dark: '#C7821A',
            contrastText: '#0A0A0A',
          },
          secondary: {
            main: '#9c27b0',
            light: '#ba68c8',
            dark: '#7b1fa2',
            contrastText: '#fff',
          },
          error: {
            main: '#d32f2f',
            light: '#ef5350',
            dark: '#c62828',
          },
          warning: {
            main: '#ed6c02',
            light: '#ff9800',
            dark: '#e65100',
          },
          info: {
            main: '#0288d1',
            light: '#03a9f4',
            dark: '#01579b',
          },
          success: {
            main: '#2e7d32',
            light: '#4caf50',
            dark: '#1b5e20',
          },
          background: {
            default: '#fafafa',
            paper: '#fff',
          },
          text: {
            primary: 'rgba(0, 0, 0, 0.87)',
            secondary: 'rgba(0, 0, 0, 0.6)',
            disabled: 'rgba(0, 0, 0, 0.38)',
          },
        }
      : {
          // Amber is the one accent, frame to content. It was blue here while
          // the amber scale loaded only with catalog-tokens.css, so the
          // shell and /catalog read as two apps. Blue survives as `info`.
          // theme/global-styles.tsx publishes these same values as the
          // --shf-amber* custom properties for the CSS that reads them.
          primary: {
            main: '#F5A21F',
            light: '#FFB935',
            dark: '#C7821A',
            contrastText: '#0A0A0A',
          },
          secondary: {
            main: '#8b949e',
            light: '#b1bac4',
            dark: '#6e7681',
            contrastText: '#ffffff',
          },
          error: {
            main: '#f85149',
            light: '#ff7b72',
            dark: '#da3633',
          },
          warning: {
            main: '#d29922',
            light: '#e3b341',
            dark: '#bb8009',
          },
          info: {
            main: '#388bfd',
            light: '#79c0ff',
            dark: '#1f6feb',
          },
          success: {
            main: '#3fb950',
            light: '#56d364',
            dark: '#2ea043',
          },
          background: {
            // One step up from GitHub's #0d1117, same hue; #131A24 was tried
            // and read too light. #161D28 is the next visible step if needed.
            default: '#111721',
            paper: '#161b22',
          },
          text: {
            primary: '#e6edf3',
            secondary: '#8b949e',
            disabled: '#484f58',
          },
          divider: '#30363d',
        }),
  },
});

export function createAppTheme(mode: PaletteMode) {
  return createTheme({
    ...getDesignTokens(mode),
    typography: {
      // Roboto, self-hosted by `styles/catalog-tokens.css` (400/500/700) and
      // loaded on every route by `theme/global-styles.tsx`.
      //
      // This said Roboto before too - and nothing ever loaded it. No
      // @font-face, no dependency, no link tag, so every surface styled
      // through the MUI theme fell through to Helvetica on macOS and Arial on
      // Windows, and the same commit rendered differently on the two
      // checkouts. The name is the same; the difference is that the font is
      // now actually in the app. `check-ui-tokens.mjs` fails if this family
      // has no @font-face rule, which is the check that would have caught it.
      fontFamily: '"Roboto", "Helvetica", "Arial", sans-serif',
      h1: {
        fontSize: '2.5rem',
        fontWeight: 500,
        lineHeight: 1.2,
      },
      h2: {
        fontSize: '2rem',
        fontWeight: 500,
        lineHeight: 1.3,
      },
      h3: {
        fontSize: '1.75rem',
        fontWeight: 500,
        lineHeight: 1.4,
      },
      h4: {
        fontSize: '1.5rem',
        fontWeight: 500,
        lineHeight: 1.4,
      },
      h5: {
        fontSize: '1.25rem',
        fontWeight: 500,
        lineHeight: 1.5,
      },
      h6: {
        fontSize: '1rem',
        fontWeight: 500,
        lineHeight: 1.5,
      },
      body1: {
        fontSize: '1rem',
        lineHeight: 1.5,
      },
      body2: {
        fontSize: '0.875rem',
        lineHeight: 1.43,
      },
      button: {
        textTransform: 'none',
        fontWeight: 500,
      },
    },
    spacing: 8,
    shape: {
      borderRadius: 4,
    },
    components: {
      MuiButton: {
        styleOverrides: {
          root: {
            borderRadius: '8px',
          },
        },
        defaultProps: {
          disableElevation: true,
        },
      },
      MuiCard: {
        styleOverrides: {
          root: {
            borderRadius: '8px',
          },
        },
      },
      MuiTextField: {
        defaultProps: {
          variant: 'outlined',
        },
      },
      MuiPaper: {
        styleOverrides: {
          rounded: {
            borderRadius: '8px',
          },
        },
      },
      MuiDialog: {
        defaultProps: {
          slotProps: {
            paper: {
              elevation: 8,
            }
          },
        },
      },
      MuiLink: {
        defaultProps: {
          underline: 'hover',
        },
      },
      MuiTooltip: {
        defaultProps: {
          arrow: true,
        },
      },
      MuiAppBar: {
        defaultProps: { elevation: 0 },
        styleOverrides: {
          root: {
            ...(mode === 'dark' && {
              backgroundColor: '#161b22',
              borderBottom: '1px solid #30363d',
            }),
          },
        },
      },
      MuiDrawer: {
        styleOverrides: {
          paper: {
            ...(mode === 'dark' && {
              backgroundColor: '#161b22',
              borderRight: '1px solid #30363d',
            }),
          },
        },
      },
    },
  });
}

export const lightTheme = createAppTheme('light');
export const darkTheme = createAppTheme('dark');
