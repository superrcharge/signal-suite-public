import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router';
import { Box, Button, Chip, CircularProgress, Slider, Tooltip, Typography } from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import EditIcon from '@mui/icons-material/Edit';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import { MainLayout } from '@/components/layouts';
import { CONTENT_GUTTER, HEADER_HEIGHT } from '@/components/layouts/main-layout';
import { DataSheetView, CATALOG_RAIL_W } from '@/components/catalog';
import { PageBanner, RailTitle } from '@/components/common';
import { BANNER_BTN_AMBER_SX, BANNER_BTN_PAPER_SX, RAIL_BANNER_H } from '@/components/common/banner-controls';
import { DocumentActions, catalogExportSpec, sheetRootProps } from '@/components/common/sheet-export';
import { useEquipment, useEquipmentItem } from '@/services';
import { useAuth } from '@/contexts/auth-context';
import { compareNatural } from '@/utils';
import '@/styles/catalog-tokens.css';

type LibraryTab = 'all' | 'satcom' | 'radio';

// Letter-size page at 96 dpi.
const PAGE_W = 816;
const PAGE_H = 1056;
const SHEET_W = 1024; // article natural width - scales down to fit PAGE_W at print time
const MIN_SCALE = 0.45;

export function CatalogSheetPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { canWrite } = useAuth();
  const { data: equipment, isLoading, isError } = useEquipmentItem(id ?? '');
  const { data: allEquipment } = useEquipment();

  const [libraryTab, setLibraryTab] = useState<LibraryTab>('all');

  const canvasRef = useRef<HTMLDivElement>(null);

  // Print-scale state ─ what gets sent to the print page.
  const [autoScale, setAutoScale] = useState<number>(PAGE_W / SHEET_W);
  const [userScale, setUserScale] = useState<number | null>(null);
  const [contentH, setContentH] = useState<number>(PAGE_H);

  // viewZoom ─ purely cosmetic. Scales the paper canvas to fill the viewport.
  // Seed accounts for sidebar width so first paint is already close.
  const [viewZoom, setViewZoom] = useState<number>(
    typeof window !== 'undefined'
      ? Math.min(1, Math.max(0.4, (window.innerWidth - CATALOG_RAIL_W - 64) / PAGE_W))
      : 1,
  );

  // Build sorted library list for sidebar.
  const alpha = (a: { nomenclature: string }, b: { nomenclature: string }) =>
    compareNatural(a.nomenclature, b.nomenclature);
  const items = allEquipment?.equipment ?? [];
  const libraryItems = (() => {
    const byTab = items.filter(eq => {
      if (libraryTab === 'satcom') return eq.terminal_type !== 'radio';
      if (libraryTab === 'radio')  return eq.terminal_type === 'radio';
      return true;
    });
    return libraryTab === 'all'
      ? [
          ...byTab.filter(eq => eq.terminal_type !== 'radio').sort(alpha),
          ...byTab.filter(eq => eq.terminal_type === 'radio').sort(alpha),
        ]
      : [...byTab].sort(alpha);
  })();

  const effectiveScale = userScale ?? autoScale;
  const isCustom = userScale !== null;

  // Horizontal offset that centres the scaled article within the paper.
  // At auto scale (≈80%) this is ~0. Grows as the user compresses further.
  const articleLeft = Math.max(0, (PAGE_W - SHEET_W * effectiveScale) / 2);

  // After fonts load, measure actual content height and compute the tightest
  // single-page print scale. minHeight was removed from DataSheet so scrollHeight
  // reflects real content, not an artificial floor.
  useEffect(() => {
    if (!equipment) return;
    void document.fonts.ready.then(() => {
      const article = document.querySelector('article');
      const h = article ? article.scrollHeight : PAGE_H;
      setContentH(h);
      setAutoScale(Math.min(PAGE_W / SHEET_W, PAGE_H / h, 1));
    });
  }, [equipment]);

  // Reset user-chosen scale when switching sheets.
  useEffect(() => {
    setUserScale(null);
  }, [id]);

  // Keep viewZoom in sync with the actual container width.
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? PAGE_W;
      // Never scale above 1 - show at true print size; scale down for narrow viewports.
      setViewZoom(Math.min(1, Math.max(0.4, (w - 64) / PAGE_W)));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <MainLayout>
      {/* ── Topbar ─────────────────────────────────────────────────────────── */}
      {/* Rail title over the list | back and the scale slider | document actions right */}
      <PageBanner>
        {/* pl 13px: the list rows' SAT / RAD badge starts 13px in, so the
            title starts on the same line. A div, not the page's h1: the sheet
            below carries the record name as its h1 (HeroBlock). */}
        <RailTitle width={CATALOG_RAIL_W} component="div">Data Sheet</RailTitle>

        {/* LEFT */}
        <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', gap: 1.5, minWidth: 0 }}>
          <Button
            startIcon={<ArrowBackIcon />}
            onClick={() => navigate('/catalog')}
            size="small"
            variant="outlined"
            sx={BANNER_BTN_PAPER_SX}
          >
            Catalog
          </Button>
          {/* No record name or document number here: the sheet below prints
              both in its own header and the list rail highlights the record,
              so the bar spent a third of its width saying it a third time. */}
        </Box>

        {/* CENTER - print controls, only when sheet is loaded */}
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

        {/* RIGHT: Edit and Full Screen, then share and Print - the order every
            printable page uses (see DocumentActions). The export captures the
            same page box print does, so whatever the scale slider is set to
            is what lands on the slide. */}
        <DocumentActions
          onPrint={() => window.open(`/catalog/${id}/print?print=1&scale=${effectiveScale.toFixed(4)}`, '_blank')}
          spec={catalogExportSpec(equipment?.nomenclature ?? '')}
        >
          {id && (
            <>
              {canWrite && (
                <Tooltip title="Edit this terminal">
                  <Button
                    startIcon={<EditIcon />}
                    size="small"
                    onClick={() => navigate(`/catalog/${id}/edit`)}
                    variant="outlined"
                    sx={BANNER_BTN_AMBER_SX}
                  >
                    Edit
                  </Button>
                </Tooltip>
              )}
              <Tooltip title="Open full-screen in new tab">
                <Button
                  startIcon={<OpenInNewIcon />}
                  size="small"
                  onClick={() => window.open(
                  `/catalog/${id}/print?scale=${effectiveScale.toFixed(4)}${isCustom ? '&custom=1' : ''}`,
                  '_blank',
                )}
                  variant="outlined"
                  sx={BANNER_BTN_PAPER_SX}
                >
                  Full Screen
                </Button>
              </Tooltip>
            </>
          )}
        </DocumentActions>
      </PageBanner>

      {/* ── Body: sidebar + sheet canvas ───────────────────────────────────── */}
      {/* Cancels the layout gutter, as the browse and editor bodies do. The
          banner above already bleeds past it, so without this the rail began
          24px right of the banner's rule and the two lines never met. */}
      {/* Exactly the height #main-content has left under the banner, so the
          rail and canvas end on the window's bottom edge; the old 49 predated
          the header offset and the banner grew with its 30px controls. */}
      <Box sx={{ display: 'flex', height: `calc(100vh - ${String(HEADER_HEIGHT + RAIL_BANNER_H)}px)`, overflow: 'hidden', mx: -CONTENT_GUTTER, mb: -CONTENT_GUTTER }}>

        {/* ── Library sidebar ─────────────────────────────────────────────── */}
        <Box sx={{
          width: CATALOG_RAIL_W, flexShrink: 0,
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
          background: 'var(--shf-graphite-900)',
          borderRight: '1px solid var(--shf-graphite-700)',
        }}>
          {/* Tabs */}
          <Box sx={{ display: 'flex', borderBottom: '1px solid var(--shf-graphite-700)', flexShrink: 0 }}>
            {(['all', 'satcom', 'radio'] as LibraryTab[]).map(t => (
              <button key={t} onClick={() => setLibraryTab(t)} style={{
                flex: 1, padding: '7px 0', background: 'transparent', border: 'none',
                borderBottom: `2px solid ${libraryTab === t ? 'var(--shf-amber)' : 'transparent'}`,
                color: libraryTab === t ? 'var(--shf-amber)' : 'var(--shf-graphite-400)',
                fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 9.5,
                letterSpacing: '0.14em', textTransform: 'uppercase', cursor: 'pointer',
              }}>{t === 'all' ? 'All' : t === 'satcom' ? 'SATCOM' : 'Radio'}</button>
            ))}
          </Box>

          {/* Item list */}
          <Box sx={{ flex: 1, overflowY: 'auto', py: '4px' }}>
            {libraryItems.map(eq => {
              const active = eq.id === id;
              const isSatcom = eq.terminal_type !== 'radio';
              return (
                <Box
                  key={eq.id}
                  onClick={() => navigate(`/catalog/${eq.id}`)}
                  sx={{
                    px: '10px', py: '7px', mb: '2px', cursor: 'pointer',
                    background: active ? 'var(--shf-graphite-700)' : 'transparent',
                    borderLeft: `3px solid ${active ? 'var(--shf-amber)' : 'transparent'}`,
                    '&:hover': { background: active ? 'var(--shf-graphite-700)' : 'var(--shf-graphite-800)' },
                  }}
                >
                  {/* Top-aligned: the badge sits on the name line, not centred
                      against the name and maker together. */}
                  <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: '7px' }}>
                    <Box component="span" sx={{
                      px: '4px', py: '1px', borderRadius: '2px', flexShrink: 0, mt: '2px',
                      background: isSatcom ? 'var(--shf-amber)' : 'var(--shf-info)',
                      color: isSatcom ? 'var(--shf-black)' : 'var(--shf-paper)',
                      fontFamily: 'var(--font-mono)', fontSize: 8, fontWeight: 700,
                      letterSpacing: '0.1em', textTransform: 'uppercase',
                    }}>{isSatcom ? 'SAT' : 'RAD'}</Box>
                    <Box sx={{ minWidth: 0 }}>
                      <Box sx={{
                        fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 11.5,
                        letterSpacing: '0.04em', textTransform: 'uppercase',
                        color: active ? 'var(--shf-amber)' : 'var(--shf-paper)',
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      }}>{eq.nomenclature || 'Untitled'}</Box>
                      {eq.make && (
                        <Box sx={{
                          fontFamily: 'var(--font-mono)', fontSize: 9.5, letterSpacing: '0.06em',
                          color: 'var(--shf-graphite-400)', mt: '1px',
                          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                        }}>{eq.make}</Box>
                      )}
                    </Box>
                  </Box>
                </Box>
              );
            })}
          </Box>
        </Box>

        {/* ── Sheet canvas ─────────────────────────────────────────────────── */}
        {/* canvasRef measures available width so viewZoom fills the paper to the viewport. */}
        <Box ref={canvasRef} sx={{
          flex: 1, overflowY: 'auto',
          background: 'var(--shf-graphite-900)',
          py: 4,
        }}>
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
                // The sheet exporter's handle. This box is the printed page;
                // the article inside it is 1024 wide with a height that flows
                // with the data, and is what gets scaled into here. Marking the
                // article instead would put two markers on the editor page,
                // which mounts a second DataSheetView in its preview pane.
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
    </MainLayout>
  );
}
