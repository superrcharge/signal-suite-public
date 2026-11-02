import { useState, useCallback, useEffect } from 'react';
import Cropper from 'react-easy-crop';
import type { Area } from 'react-easy-crop';

const MAX_DIMENSION = 1400;
const MIN_ZOOM = 0.3;
const DEFAULT_ZOOM = 1;

async function canvasToFile(canvas: HTMLCanvasElement, originalFile: File): Promise<File> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) { reject(new Error('canvas export failed')); return; }
        resolve(new File([blob], originalFile.name, { type: originalFile.type }));
      },
      originalFile.type,
      0.92,
    );
  });
}

function scaleToMax(w: number, h: number, max: number): [number, number] {
  if (w <= max && h <= max) return [w, h];
  const ratio = Math.min(max / w, max / h);
  return [Math.round(w * ratio), Math.round(h * ratio)];
}

async function buildFile(
  imageSrc: string,
  pixelCrop: Area | null,
  originalFile: File,
  background: string | null,
): Promise<File> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = reject;
    el.src = imageSrc;
  });

  const srcX = pixelCrop ? pixelCrop.x : 0;
  const srcY = pixelCrop ? pixelCrop.y : 0;
  const srcW = pixelCrop ? pixelCrop.width : img.naturalWidth;
  const srcH = pixelCrop ? pixelCrop.height : img.naturalHeight;

  const [dstW, dstH] = scaleToMax(srcW, srcH, MAX_DIMENSION);

  const canvas = document.createElement('canvas');
  canvas.width = dstW;
  canvas.height = dstH;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('no 2d context');

  // The fill covers any empty area when the image doesn't fully cover the
  // crop box (happens when zoom < 1 with restrictPosition=false). A null
  // background leaves it transparent, except for a JPEG, which has no alpha
  // channel and would export the empty area as black.
  const fill = background ?? (originalFile.type === 'image/jpeg' ? '#FFFFFF' : null);
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fillRect(0, 0, dstW, dstH);
  }

  const scale = dstW / srcW;
  ctx.drawImage(
    img,
    0, 0, img.naturalWidth, img.naturalHeight,
    -srcX * scale, -srcY * scale,
    img.naturalWidth * scale, img.naturalHeight * scale,
  );

  return canvasToFile(canvas, originalFile);
}

interface PhotoCropModalProps {
  file: File;
  onConfirm: (file: File) => void;
  onClose: () => void;
  /** Width over height of the crop window. Undefined is a free rectangle. */
  aspect?: number;
  /** 'round' draws the crop window as a circle, for an image shown in a circular cutout. */
  cropShape?: 'rect' | 'round';
  title?: string;
  /** Fill behind any area the image does not cover. Null keeps it transparent. */
  background?: string | null;
  /** Offer "Use Full Image". Off where the destination would centre-crop it anyway. */
  allowFullImage?: boolean;
  /**
   * Let the user pick the fill (none, black or white), drawn in the preview as
   * well as the output. For a logo on a solid square: zoom out until the square
   * sits inside the circle, then fill to match and the circle reads as one piece.
   */
  fillOptions?: boolean;
}

const BLACK = '#000000';
const WHITE = '#FFFFFF';
// What the crop area shows behind the image when nothing is filled.
const EMPTY_PREVIEW = '#0A0A0A';

export function PhotoCropModal({
  file,
  onConfirm,
  onClose,
  aspect,
  cropShape = 'rect',
  title = 'Crop Photo',
  background = WHITE,
  allowFullImage = true,
  fillOptions = false,
}: PhotoCropModalProps) {
  // A JPEG has no alpha, so "none" is not a choice it can honour.
  const isJpeg = file.type === 'image/jpeg';
  const fillChoices: { label: string; value: string | null }[] = [
    ...(isJpeg ? [] : [{ label: 'None', value: null }]),
    { label: 'Black', value: BLACK },
    { label: 'White', value: WHITE },
  ];
  const [fill, setFill] = useState<string | null>(background ?? (isJpeg ? WHITE : null));

  // One URL per file, revoked when the file changes or the modal unmounts.
  // Minting it in the render body leaked a URL per drag and zoom tick, and
  // Cancel never revoked any of them. It is created inside the effect rather
  // than memoised, because StrictMode's mount-cleanup-mount would otherwise
  // revoke a memoised URL that the second mount goes on using.
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  useEffect(() => {
    const url = URL.createObjectURL(file);
    setImageSrc(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(DEFAULT_ZOOM);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [busy, setBusy] = useState(false);

  const onCropComplete = useCallback((_: Area, pixels: Area) => {
    setCroppedAreaPixels(pixels);
  }, []);

  const handleApplyCrop = async () => {
    if (!imageSrc) return;
    setBusy(true);
    try {
      const result = await buildFile(imageSrc, croppedAreaPixels, file, fill);
      onConfirm(result);
    } finally {
      setBusy(false);
    }
  };

  const handleUseFullImage = async () => {
    if (!imageSrc) return;
    setBusy(true);
    try {
      const result = await buildFile(imageSrc, null, file, fill);
      onConfirm(result);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div role="dialog" aria-modal="true" aria-label={title} style={{
      position: 'fixed', inset: 0, zIndex: 1400,
      background: 'rgba(0,0,0,0.85)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      gap: 0,
    }}>
      {/* Header */}
      <div style={{
        width: '100%', maxWidth: 640,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 16px',
        background: 'var(--shf-graphite-800)',
        borderBottom: '1px solid var(--shf-graphite-600)',
      }}>
        <div style={{
          fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 13,
          letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--shf-amber)',
        }}>{title}</div>
        <button
          onClick={onClose}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--shf-graphite-300)', fontSize: 20, lineHeight: 1, padding: '2px 4px',
          }}
          aria-label="Close"
        >×</button>
      </div>

      {/* Crop area */}
      <div style={{ position: 'relative', width: '100%', maxWidth: 640, height: 420, background: '#000' }}>
        {imageSrc && <Cropper
          image={imageSrc}
          crop={crop}
          zoom={zoom}
          minZoom={MIN_ZOOM}
          maxZoom={3}
          aspect={aspect}
          cropShape={cropShape}
          restrictPosition={false}
          onCropChange={setCrop}
          onZoomChange={setZoom}
          onCropComplete={onCropComplete}
          style={{
            // Only a pickable fill is previewed, so the catalog's crop looks as it always has.
            containerStyle: { background: fillOptions && fill ? fill : EMPTY_PREVIEW },
            cropAreaStyle: { border: '2px solid var(--shf-amber)', color: 'rgba(245,162,31,0.25)' },
          }}
        />}
      </div>

      {/* Zoom + recenter */}
      <div style={{
        width: '100%', maxWidth: 640,
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '10px 16px',
        background: 'var(--shf-graphite-800)',
        borderTop: '1px solid var(--shf-graphite-700)',
      }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--shf-graphite-400)', letterSpacing: '0.08em', whiteSpace: 'nowrap' }}>ZOOM</span>
        <input
          type="range"
          min={MIN_ZOOM} max={3} step={0.01}
          value={zoom}
          onChange={e => setZoom(Number(e.target.value))}
          style={{ flex: 1, accentColor: 'var(--shf-amber)' }}
        />
        <button
          onClick={() => { setCrop({ x: 0, y: 0 }); setZoom(DEFAULT_ZOOM); }}
          style={{
            padding: '4px 10px', border: '1px solid var(--shf-graphite-500)',
            background: 'transparent', color: 'var(--shf-graphite-300)',
            fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.08em',
            textTransform: 'uppercase', borderRadius: 2, cursor: 'pointer', whiteSpace: 'nowrap',
          }}
        >Recenter</button>
      </div>

      {fillOptions && (
        <div style={{
          width: '100%', maxWidth: 640,
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '10px 16px',
          background: 'var(--shf-graphite-800)',
          borderTop: '1px solid var(--shf-graphite-700)',
        }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--shf-graphite-400)', letterSpacing: '0.08em', whiteSpace: 'nowrap', marginRight: 4 }}>BACKGROUND</span>
          {fillChoices.map(({ label, value }) => {
            const active = fill === value;
            return (
              <button
                key={label}
                aria-pressed={active}
                onClick={() => setFill(value)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '4px 10px',
                  border: `1px solid ${active ? 'var(--shf-amber)' : 'var(--shf-graphite-500)'}`,
                  background: 'transparent',
                  color: active ? 'var(--shf-amber)' : 'var(--shf-graphite-300)',
                  fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.08em',
                  textTransform: 'uppercase', borderRadius: 2, cursor: 'pointer', whiteSpace: 'nowrap',
                }}
              >
                <span aria-hidden style={{
                  width: 10, height: 10, borderRadius: '50%',
                  border: '1px solid var(--shf-graphite-400)',
                  background: value ?? 'transparent',
                }} />
                {label}
              </button>
            );
          })}
        </div>
      )}

      {/* Footer buttons */}
      <div style={{
        width: '100%', maxWidth: 640,
        display: 'flex', gap: 8, justifyContent: 'flex-end',
        padding: '10px 16px',
        background: 'var(--shf-graphite-800)',
        borderTop: '1px solid var(--shf-graphite-600)',
      }}>
        <button
          onClick={onClose}
          disabled={busy}
          style={{
            padding: '7px 18px', border: '1px solid var(--shf-graphite-500)',
            background: 'transparent', color: 'var(--shf-graphite-200)',
            fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 11,
            letterSpacing: '0.12em', textTransform: 'uppercase',
            borderRadius: 2, cursor: busy ? 'not-allowed' : 'pointer', opacity: busy ? 0.5 : 1,
          }}
        >Cancel</button>
        {allowFullImage && (
          <button
            onClick={handleUseFullImage}
            disabled={busy}
            style={{
              padding: '7px 18px', border: '1px solid var(--shf-graphite-500)',
              background: 'var(--shf-graphite-700)', color: 'var(--shf-paper)',
              fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 11,
              letterSpacing: '0.12em', textTransform: 'uppercase',
              borderRadius: 2, cursor: busy ? 'not-allowed' : 'pointer', opacity: busy ? 0.5 : 1,
            }}
          >{busy ? 'Processing…' : 'Use Full Image'}</button>
        )}
        <button
          onClick={handleApplyCrop}
          disabled={busy}
          style={{
            padding: '7px 18px', border: 0,
            background: 'var(--shf-amber)', color: 'var(--shf-black)',
            fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 11,
            letterSpacing: '0.12em', textTransform: 'uppercase',
            borderRadius: 2, cursor: busy ? 'not-allowed' : 'pointer', opacity: busy ? 0.5 : 1,
          }}
        >{busy ? 'Processing…' : 'Apply Crop'}</button>
      </div>
    </div>
  );
}
