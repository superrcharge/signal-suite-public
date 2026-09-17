import { useState, useCallback } from 'react';
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

  // White fill covers any empty area when the image doesn't fully cover
  // the crop box (happens when zoom < 1 with restrictPosition=false).
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, dstW, dstH);

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
}

export function PhotoCropModal({ file, onConfirm, onClose }: PhotoCropModalProps) {
  const imageSrc = URL.createObjectURL(file);

  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(DEFAULT_ZOOM);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [busy, setBusy] = useState(false);

  const onCropComplete = useCallback((_: Area, pixels: Area) => {
    setCroppedAreaPixels(pixels);
  }, []);

  const handleApplyCrop = async () => {
    setBusy(true);
    try {
      const result = await buildFile(imageSrc, croppedAreaPixels, file);
      onConfirm(result);
    } finally {
      setBusy(false);
      URL.revokeObjectURL(imageSrc);
    }
  };

  const handleUseFullImage = async () => {
    setBusy(true);
    try {
      const result = await buildFile(imageSrc, null, file);
      onConfirm(result);
    } finally {
      setBusy(false);
      URL.revokeObjectURL(imageSrc);
    }
  };

  return (
    <div style={{
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
        }}>Crop Photo</div>
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
        <Cropper
          image={imageSrc}
          crop={crop}
          zoom={zoom}
          minZoom={MIN_ZOOM}
          maxZoom={3}
          aspect={undefined}
          restrictPosition={false}
          onCropChange={setCrop}
          onZoomChange={setZoom}
          onCropComplete={onCropComplete}
          style={{
            containerStyle: { background: '#0A0A0A' },
            cropAreaStyle: { border: '2px solid var(--shf-amber)', color: 'rgba(245,162,31,0.25)' },
          }}
        />
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
