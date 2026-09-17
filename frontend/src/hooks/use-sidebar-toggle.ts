import { useState, useCallback } from 'react';

export function useSidebarToggle(key: string, defaultOpen = true): [boolean, () => void] {
  const storageKey = `signal-suite-sidebar-${key}`;

  const [open, setOpen] = useState<boolean>(() => {
    const stored = localStorage.getItem(storageKey);
    return stored === null ? defaultOpen : stored === 'true';
  });

  const toggle = useCallback(() => {
    setOpen((prev) => {
      const next = !prev;
      localStorage.setItem(storageKey, String(next));
      return next;
    });
  }, [storageKey]);

  return [open, toggle];
}
