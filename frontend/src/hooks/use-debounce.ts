import { useState, useEffect } from 'react';

/**
 * Hook that debounces a value
 *
 * @param value - Value to debounce
 * @param delay - Delay in milliseconds
 * @returns Debounced value
 *
 * @example
 * ```tsx
 * function SearchComponent() {
 *   const [search, setSearch] = useState('');
 *   const debouncedSearch = useDebounce(search, 300);
 *
 *   // API call only fires after 300ms of no typing
 *   useEffect(() => {
 *     if (debouncedSearch) {
 *       searchAPI(debouncedSearch);
 *     }
 *   }, [debouncedSearch]);
 *
 *   return (
 *     <input
 *       value={search}
 *       onChange={(e) => setSearch(e.target.value)}
 *     />
 *   );
 * }
 * ```
 */
export function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(timer);
    };
  }, [value, delay]);

  return debouncedValue;
}
