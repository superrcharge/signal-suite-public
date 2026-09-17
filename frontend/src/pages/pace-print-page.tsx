import { useEffect, useRef } from 'react';
import { useParams, useSearchParams } from 'react-router';
import { Box, Typography } from '@mui/material';

import { SheetPreview, PAGE_W, PAGE_H } from '@/components/pace/SheetPreview';
import { usePaceEmblem } from '@/components/pace/use-pace-emblem';
import { usePaceCard, useSections } from '@/services';
import { LoadingSpinner } from '@/components/common';
import { DocumentActions, paceExportSpec } from '@/components/common/sheet-export';
import { waitForImages } from '@/utils';
import '@/styles/catalog-tokens.css';

// The catalog datasheet is portrait and has to be scaled to fit, so that page
// carries a scale slider. This one does not: the PACE sheet is drawn at exactly
// 1056x816, which is US Letter landscape at 96dpi, so a fixed landscape page
// rule replaces the slider entirely. Adding a scale control here would only
// offer ways to make a page that already fits fit worse.
const PRINT_CSS = '@media print { @page { size: letter landscape; margin: 0; } }';

export function PacePrintPage() {
  const { section } = useParams<{ section: string }>();
  const [searchParams] = useSearchParams();
  const { data: card, isLoading, isError } = usePaceCard(section ?? '');
  const { data: sections } = useSections();
  const styleRef = useRef<HTMLStyleElement | null>(null);

  const isPrintMode = searchParams.get('print') === '1';

  // Derived the same way pace-section-page.tsx derives it, so the printed sheet
  // and the on-screen one never disagree about what the squadron is called.
  const sectionLabel =
    sections?.find((s) => s.key === section)?.label ?? (section ?? '').toUpperCase();

  // The sheet resolves its own emblem; this page only needs to know when that
  // has settled, so it does not print a placeholder over a real emblem.
  const { ready: emblemReady } = usePaceEmblem(section, card?.emblem_url, sectionLabel);

  // Fonts first, then images, then print. Firing window.print() before the
  // display face has loaded prints the fallback, and before the emblem has
  // decoded prints an empty hub.
  // The landscape rule goes in as soon as we are in print mode, not once the
  // emblem resolves. catalog-tokens.css declares @page portrait and is imported
  // by this page and by SheetPreview, so the landscape rule wins only by being
  // appended later - which meant an emblem that never resolved left a 1056px
  // landscape sheet printing against a portrait page.
  useEffect(() => {
    if (!isPrintMode) return;
    if (!styleRef.current) {
      styleRef.current = document.createElement('style');
      document.head.appendChild(styleRef.current);
    }
    styleRef.current.textContent = PRINT_CSS;
  }, [isPrintMode]);

  useEffect(() => {
    // emblemReady covers the emblem, which is an SVG <image> and so invisible to
    // waitForImages. waitForImages covers the tier photos, which are <img>
    // elements EquipmentPhoto inserts only after an apiFetch resolves - exactly
    // the asynchronous-insertion case its MutationObserver exists for. Printing
    // before either settles puts a placeholder emblem or a missing photo on a
    // squadron's card. catalog-print-page.tsx has had the image wait since it
    // shipped; this page never did.
    if (!card || !isPrintMode || !emblemReady) return;
    let cancelled = false;

    // Only wait when a photo is actually coming, mirroring
    // catalog-print-page.tsx. waitForImages does NOT resolve early on an empty
    // document - with no <img> present it waits out its full 5s timeout, which
    // the observer needs in order to catch an image inserted later. Calling it
    // unconditionally would delay every print by five seconds.
    const expectsPhoto = (card.tiers ?? []).some(
      (t) => t.source === 'equipment' && t.equipment_id && t.equipment_photo_url,
    );

    void document.fonts.ready
      .then(() => (cancelled || !expectsPhoto ? Promise.resolve() : waitForImages()))
      .then(() => {
        if (cancelled) return;
        window.print();
      });

    return () => { cancelled = true; };
  }, [card, isPrintMode, emblemReady]);

  // Cleanup injected <style> on unmount
  useEffect(() => {
    return () => {
      if (styleRef.current) {
        styleRef.current.remove();
        styleRef.current = null;
      }
    };
  }, []);

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', pt: 10 }}>
        <LoadingSpinner />
      </Box>
    );
  }

  if (isError) {
    return (
      <Box sx={{ pt: 10, textAlign: 'center' }}>
        <Typography color="error">Could not load this squadron&apos;s comms card.</Typography>
      </Box>
    );
  }

  // Print mode: the sheet alone, nothing around it. The print dialog fires from
  // the effect above.
  if (isPrintMode) {
    return (
      <Box sx={{ '@media print': { background: 'white' } }}>
        <SheetPreview card={card} sectionLabel={sectionLabel} />
      </Box>
    );
  }

  return (
    <Box sx={{
      minHeight: '100vh',
      background: 'var(--shf-graphite-900)',
      display: 'flex',
      flexDirection: 'column',
    }}>
      <Box sx={{
        display: 'flex', alignItems: 'center', gap: 2,
        px: 2.5, py: 0.75,
        borderBottom: '2px solid var(--shf-amber)',
        background: 'var(--shf-graphite-900)',
        flexShrink: 0,
      }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography noWrap sx={{
            fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 15,
            letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--shf-amber)',
            overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            {sectionLabel}
            {card?.title && (
              <Box component="span" sx={{
                fontFamily: 'var(--font-mono)', fontSize: 10.5,
                color: 'var(--shf-graphite-300)', ml: 2,
              }}>
                {card.title}
              </Box>
            )}
          </Typography>
        </Box>

        {/* Preview branch only. The ?print=1 branch above fires window.print()
            on mount and has no chrome at all. Share then Print, right end, as
            on every printable page (see DocumentActions). */}
        <DocumentActions
          onPrint={() => window.open(`/pace/${section}/print?print=1`, '_blank')}
          spec={paceExportSpec(section ?? '', sectionLabel)}
        />
      </Box>

      <Box sx={{ flex: 1, py: 4, display: 'flex', justifyContent: 'center' }}>
        <Box sx={{
          width: PAGE_W,
          height: PAGE_H,
          flexShrink: 0,
          boxShadow: '0 6px 40px rgba(0,0,0,0.5)',
        }}>
          <SheetPreview card={card} sectionLabel={sectionLabel} />
        </Box>
      </Box>
    </Box>
  );
}
