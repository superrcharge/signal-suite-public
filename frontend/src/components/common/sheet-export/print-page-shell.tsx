import { useEffect, type CSSProperties, type ReactNode } from 'react';
import { Box, Button } from '@mui/material';
import { BANNER_BTN_PAPER_SX } from '@/components/common/banner-controls';
import { DocumentActions } from './document-actions';
import '@/styles/catalog-tokens.css';

/** The shell pads 24px, so DocumentActions gets `inset={3}` to end on the content line. */
const SHELL_PAD = 24;

/**
 * The print-only stylesheet a chrome-free print route needs, as text for a
 * `<style>` element.
 *
 * It goes through `document.head`, never an emotion `sx` object: emotion nests
 * an `@page` inside a class rule, where it is invalid and silently dropped,
 * and catalog-tokens.css's own `@page { size: letter portrait }` wins. That
 * broke two print routes before this was written down (AGENTS.md records
 * them). Appended after that stylesheet, so this rule is the one that holds.
 *
 * Under `@media print` nothing but the marked root reaches paper - not the
 * toolbar, and not anything fixed the app mounts beside the route, such as
 * the React Query devtools badge.
 */
function printOnlyCss(rootAttr: string, orientation: 'portrait' | 'landscape'): string {
  return (
    `@page { size: letter ${orientation}; margin: 0.4in; } ` +
    '@media print { body * { visibility: hidden !important; } ' +
    `[${rootAttr}], [${rootAttr}] * { visibility: visible !important; } ` +
    `[${rootAttr}] { position: absolute; left: 0; top: 0; width: 100%; } }`
  );
}

/**
 * Mounts `css` in `document.head` for the component's lifetime. Unconditional
 * and on mount: an `@page` rule only has effect in print media, so there is
 * no preview state it could disturb, and injecting it before any data arrives
 * means a slow network cannot leave the sheet on the wrong orientation.
 */
function usePrintPageStyle(css: string): void {
  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);
    return () => { style.remove(); };
  }, [css]);
}

/**
 * The chrome-free page every print route is: a dark canvas, one bar with Back
 * on the left and Print / Save PDF right-justified on the content line, and
 * beneath it the marked root that is all a printer sees.
 *
 * A route rather than a print stylesheet over the live page, matching every
 * other print surface here: hiding MainLayout with `@media print` rules would
 * encode the whole layout a second time. No share trigger: the live page
 * carries the export, and a print preview has nothing the live page lacks.
 *
 * `rootAttr` is the route's own marker (`data-nets-print-root`, ...), so two
 * routes can never select each other's root. `rootStyle` is for a sheet that
 * prints on its own paper, such as the compatibility matrix; the shell always
 * sets `print-color-adjust: exact` so the palette survives the print dialog.
 */
export function PrintPageShell({
  orientation,
  rootAttr,
  backLabel,
  onBack,
  onPrint = () => { window.print(); },
  printDisabled = false,
  rootStyle,
  rootAriaLabel,
  children,
}: {
  orientation: 'portrait' | 'landscape';
  rootAttr: string;
  backLabel: string;
  onBack: () => void;
  onPrint?: () => void;
  printDisabled?: boolean;
  rootStyle?: CSSProperties;
  rootAriaLabel?: string;
  children: ReactNode;
}) {
  usePrintPageStyle(printOnlyCss(rootAttr, orientation));

  return (
    <div style={{ minHeight: '100vh', background: 'var(--shf-graphite-900)', padding: SHELL_PAD }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
        <Button variant="outlined" onClick={onBack} sx={BANNER_BTN_PAPER_SX}>
          ← {backLabel}
        </Button>
        <DocumentActions inset={SHELL_PAD / 8} onPrint={onPrint} printDisabled={printDisabled} />
      </Box>

      <div
        {...{ [rootAttr]: '' }}
        aria-label={rootAriaLabel}
        style={{ printColorAdjust: 'exact', WebkitPrintColorAdjust: 'exact', ...rootStyle }}
      >
        {children}
      </div>
    </div>
  );
}
