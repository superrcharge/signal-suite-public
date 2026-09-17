import { useState, useEffect } from 'react';
import { apiFetch } from '@/auth/api-client';

interface EquipmentPhotoProps {
  equipmentId: string;
  photoUrl?: string;
  alt?: string;
  style?: React.CSSProperties;
}

export function EquipmentPhoto({ equipmentId, photoUrl, alt, style }: EquipmentPhotoProps) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;

    apiFetch(`/api/v1/equipment/${equipmentId}/photo`)
      .then(r => (r.ok ? r.blob() : null))
      .then(blob => {
        if (cancelled || !blob) return;
        objectUrl = URL.createObjectURL(blob);
        setBlobUrl(objectUrl);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      setBlobUrl(null);
    };
  }, [equipmentId, photoUrl]);

  if (!blobUrl) return null;
  return <img src={blobUrl} alt={alt} style={style} />;
}
