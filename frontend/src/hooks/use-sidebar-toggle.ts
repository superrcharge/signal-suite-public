import { useState, useCallback } from 'react';

/**
 * Open/closed state for one sidebar group, persisted per group under
 * `signal-suite-sidebar-<key>` in localStorage.
 *
 * A stored value always wins. `defaultOpen` applies only on a browser that has
 * never toggled this group, which is why it is required rather than defaulted:
 * every group's first-load state is a decision made at its call site, not one
 * inherited from a parameter nobody passed.
 */
export function useSidebarToggle(key: string, defaultOpen: boolean): [boolean, () => void] {
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
