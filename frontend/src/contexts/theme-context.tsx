import { createContext, useContext, ReactNode } from 'react';
import { ThemeProvider as MuiThemeProvider, PaletteMode } from '@mui/material';
import CssBaseline from '@mui/material/CssBaseline';
import { createAppTheme, GlobalStyles } from '@/theme';

type ThemeMode = PaletteMode;

interface ThemeContextValue {
  mode: ThemeMode;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

/**
 * The app is dark. Not "dark by default" - dark, structurally.
 *
 * It read as dark-by-default before, and that was the problem rather than the
 * behaviour: `getInitialMode()` returned 'dark' on both of its branches, so a
 * fresh browser always loaded dark and the light path looked unreachable. It
 * was not. Two things still produced light, and the header toggle was the only
 * way back from either:
 *
 * - `localStorage['theme_mode']` was read BEFORE the dark default, so anyone
 *   who had ever clicked the toggle to light loaded light on every subsequent
 *   visit. Removing the toggle without removing that read would have stranded
 *   exactly those users in a mode they could no longer leave.
 * - A `prefers-color-scheme` listener set light whenever the OS changed and no
 *   explicit choice was stored.
 *
 * Both are gone. There is no mode state left to hold, so there is nothing to
 * memoise and nothing to toggle. `mode` stays on the context because callers
 * read it to branch styling; it is now a constant.
 *
 * The stale `theme_mode` key is deliberately NOT deleted from localStorage.
 * Nothing reads it, so a leftover 'light' is inert, and it still carries the
 * user's old preference if light mode is ever restored.
 *
 * If you are here to add an OS listener back, note that restoring light mode is
 * a one-file change: `createAppTheme` still takes a mode and `lightTheme` is
 * still exported from `@/theme`.
 */
const DARK: ThemeContextValue = { mode: 'dark' };

const theme = createAppTheme('dark');

interface ThemeProviderProps {
  children: ReactNode;
}

export function ThemeProvider({ children }: ThemeProviderProps) {
  return (
    <ThemeContext.Provider value={DARK}>
      <MuiThemeProvider theme={theme}>
        <CssBaseline />
        <GlobalStyles />
        {children}
      </MuiThemeProvider>
    </ThemeContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useThemeMode() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useThemeMode must be used within ThemeProvider');
  }
  return context;
}
