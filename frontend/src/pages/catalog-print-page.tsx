import { useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router';
import { Box, Chip, CircularProgress, Slider, Typography } from '@mui/material';
import { DataSheetView } from '@/components/catalog';
import { DocumentActions, catalogExportSpec, sheetRootProps } from '@/components/common/sheet-export';
import { useEquipmentItem } from '@/services';
import { waitForImages } from '@/utils';
import '@/styles/catalog-tokens.css';

const PAGE_W = 816;
const PAGE_H = 1056;
const SHEET_W = 1024; // article natural width - scales down to fit PAGE_W at print time
const MIN_SCALE = 0.45;

export function CatalogPrintPage() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const { data: equipment, isLoading, isError } = useEquipmentItem(id ?? '');
  const styleRef = useRef<HTMLStyleElement | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);

  const isPrintMode = searchParams.get('print') === '1';
  const rawScale = parseFloat(searchParams.get('scale') ?? '');
  const urlScale = !isNaN(rawScale) && rawScale > 0 && rawScale <= 1 ? rawScale : null;
  // custom=1 means the user explicitly moved the slider on the view-sheet page;
  // without it the URL scale is just the auto-fit value and should be treated as "auto".
  const urlIsCustom = searchParams.get('custom') === '1';

  // If the URL scale was explicitly chosen by the user, preserve it as userScale so
  // the Reset chip appears and they can revert to auto. Otherwise seed autoScale so
  // the first paint matches the view-sheet and the "auto" badge shows.
  const [autoScale, setAutoScale] = useState<number>(
    urlIsCustom ? PAGE_W / SHEET_W : (urlScale ?? PAGE_W / SHEET_W),
  );
  const [userScale, setUserScale] = useState<number | null>(
    urlIsCustom && urlScale !== null ? urlScale : null,
  );
  const [contentH, setContentH] = useState<number>(PAGE_H);

  // viewZoom - cosmetic only, never sent to the print page.
  // Scales the paper to fill the viewport so content looks natural, not shrunk.
  const [viewZoom, setViewZoom] = useState<number>(
    typeof window !== 'undefined'
      ? Math.min(1, Math.max(0.4, (window.innerWidth - 64) / PAGE_W))
      : 1,
  );

  const effectiveScale = userScale ?? autoScale;
  const isCustom = userScale !== null;
  const articleLeft = Math.max(0, (PAGE_W - SHEET_W * effectiveScale) / 2);

  // ── Print CSS injection (used only by ?print=1 mode) ──────────────────────
  const injectPrintCSS = (scale: number) => {
    if (!styleRef.current) {
      styleRef.current = document.createElement('style');
      document.head.appendChild(styleRef.current);
    }
    const leftOffset = Math.max(0, (PAGE_W - SHEET_W * scale) / 2);
    styleRef.current.textContent =
      `@media print { .catalog-print-wrapper article { transform: scale(${scale.toFixed(6)}); left: ${leftOffset.toFixed(2)}px; } }`;
  };

  // ── Main effect: measure content → compute autoScale → trigger print ───────
  useEffect(() => {
    if (!equipment) return;
    let cancelled = false;

    void document.fonts.ready
      .then(() => (isPrintMode && equipment.photo_url ? waitForImages() : Promise.resolve()))
      .then(() => {
        if (cancelled) return;
        const article = document.querySelector('article');
        const h = article ? article.scrollHeight : PAGE_H;
        setContentH(h);
        const computed = Math.min(PAGE_W / SHEET_W, PAGE_H / h, 1);
        setAutoScale(computed);

        if (isPrintMode) {
          // If the user explicitly chose a scale (custom=1), honour it; otherwise
          // use the freshly computed auto-fit value so print matches the preview exactly.
          injectPrintCSS(urlIsCustom && urlScale !== null ? urlScale : computed);
          window.print();
        }
      });

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [equipment]);

  // ── Cleanup injected <style> on unmount ────────────────────────────────────
  useEffect(() => {
    return () => {
      if (styleRef.current) {
        styleRef.current.remove();
        styleRef.current = null;
      }
    };
  }, []);

  // ── Keep paper canvas responsive to viewport width ─────────────────────────
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? PAGE_W;
      setViewZoom(Math.min(1, Math.max(0.4, (w - 64) / PAGE_W)));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ── Print mode: minimal render, print dialog fires from the effect above ───
  if (isPrintMode) {
    return (
      <Box sx={{ '@media print': { background: 'white' } }}>
        {equipment && (
          <div className="catalog-print-wrapper">
            <DataSheetView equipment={equipment} />
          </div>
        )}
      </Box>
    );
  }

  // ── Fullscreen preview mode ────────────────────────────────────────────────
  return (
    <Box sx={{
      minHeight: '100vh',
      background: 'var(--shf-graphite-900)',
      display: 'flex',
      flexDirection: 'column',
    }}>
      {/* Topbar - mirrors the sheet page's bar: name left | scale slider, then share and Print right */}
      <Box sx={{
        display: 'flex', alignItems: 'center', gap: 2,
        px: 2.5, py: 0.75,
        borderBottom: '2px solid var(--shf-amber)',
        background: 'var(--shf-graphite-900)',
        flexShrink: 0,
      }}>
        {/* LEFT: equipment name */}
        <Box sx={{ flex: 1, minWidth: 0 }}>
          {equipment && (
            <Typography noWrap sx={{
              fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 15,
              letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--shf-amber)',
              overflow: 'hidden', textOverflow: 'ellipsis',
            }}>
              {equipment.nomenclature}
              {equipment.doc_number && (
                <Box component="span" sx={{
                  fontFamily: 'var(--font-mono)', fontSize: 10.5,
                  color: 'var(--shf-graphite-300)', ml: 2,
                }}>
                  {equipment.doc_number}
                </Box>
              )}
            </Typography>
          )}
        </Box>

        {/* Scale slider, then the document actions - the sheet page's controls */}
        {equipment && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexShrink: 0 }}>
            <Typography sx={{
              fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 600,
              letterSpacing: '0.10em', textTransform: 'uppercase',
              color: 'var(--shf-graphite-500)', whiteSpace: 'nowrap', lineHeight: 1,
            }}>
              Scale
            </Typography>

            <Box sx={{ width: 160, display: 'flex', alignItems: 'center' }}>
              <Slider
                size="small"
                min={MIN_SCALE}
                max={autoScale}
                step={0.005}
                value={effectiveScale}
                onChange={(_e, v) => setUserScale(v)}
                marks={[{ value: autoScale }]}
                sx={{
                  color: 'var(--shf-amber)',
                  py: '6px',
                  '& .MuiSlider-mark': {
                    backgroundColor: 'rgba(255,185,0,0.55)', height: 8, width: 2, borderRadius: 0,
                  },
                  '& .MuiSlider-markLabel': { display: 'none' },
                }}
              />
            </Box>

            <Typography sx={{
              fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700,
              color: isCustom ? 'var(--shf-amber)' : 'var(--shf-graphite-300)',
              minWidth: 32, textAlign: 'right', lineHeight: 1,
            }}>
              {Math.round((effectiveScale / autoScale) * 100)}%
            </Typography>

            {!isCustom ? (
              <Typography sx={{
                fontFamily: 'var(--font-mono)', fontSize: 9,
                color: 'var(--shf-graphite-600)', letterSpacing: '0.08em',
                textTransform: 'uppercase', lineHeight: 1,
              }}>
                auto
              </Typography>
            ) : (
              <Chip
                label="Reset"
                size="small"
                onClick={() => setUserScale(null)}
                sx={{
                  fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 600,
                  letterSpacing: '0.08em', textTransform: 'uppercase',
                  background: '#2F343A', color: 'var(--shf-graphite-300)',
                  height: 20, borderRadius: '4px',
                  '&:hover': { background: '#444A52' },
                }}
              />
            )}

          </Box>
        )}

        {/* RIGHT: share then Print, the order every printable page uses (see
            DocumentActions). */}
        {equipment && (
          <DocumentActions
            onPrint={() => window.open(`/catalog/${id}/print?print=1&scale=${effectiveScale.toFixed(4)}`, '_blank')}
            spec={catalogExportSpec(equipment.nomenclature)}
          />
        )}
      </Box>

      {/* Paper canvas - same responsive approach as catalog-sheet-page */}
      <Box ref={canvasRef} sx={{ flex: 1, py: 4 }}>
        {isLoading && (
          <Box sx={{ display: 'flex', justifyContent: 'center', pt: 10 }}>
            <CircularProgress sx={{ color: 'var(--shf-amber)' }} />
          </Box>
        )}
        {isError && (
          <Box sx={{ pt: 10, textAlign: 'center' }}>
            <Typography color="error">Equipment not found.</Typography>
          </Box>
        )}

        {equipment && (
          <Box sx={{
            width: '100%',
            height: Math.max(PAGE_H, contentH * effectiveScale) * viewZoom,
            display: 'flex',
            justifyContent: 'center',
          }}>
            <Box
              // Same handle as catalog-sheet-page: the page box, not the article.
              {...sheetRootProps()}
              sx={{
              width: PAGE_W,
              height: PAGE_H,
              flexShrink: 0,
              background: 'var(--shf-paper)',
              boxShadow: '0 6px 40px rgba(0,0,0,0.5)',
              position: 'relative',
              transform: `scale(${viewZoom})`,
              transformOrigin: 'top center',
            }}>
              <Box sx={{
                position: 'absolute',
                top: 0,
                left: `${articleLeft}px`,
                transform: `scale(${effectiveScale})`,
                transformOrigin: 'top left',
                transition: 'transform 0.15s ease, left 0.15s ease',
              }}>
                <DataSheetView equipment={equipment} />
              </Box>
            </Box>
          </Box>
        )}
      </Box>
    </Box>
  );
}
