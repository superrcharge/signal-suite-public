import { useState, useEffect } from 'react';

/**
 * Hook that tracks a media query match
 *
 * @param query - Media query string
 * @returns Whether the query matches
 *
 * @example
 * ```tsx
 * function ResponsiveComponent() {
 *   const isMobile = useMediaQuery('(max-width: 600px)');
 *   const prefersReducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
 *
 *   return (
 *     <div>
 *       {isMobile ? <MobileNav /> : <DesktopNav />}
 *     </div>
 *   );
 * }
 * ```
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => {
    if (typeof window !== 'undefined') {
      return window.matchMedia(query).matches;
    }
    return false;
  });

  useEffect(() => {
    const mediaQuery = window.matchMedia(query);

    // Set initial value
    setMatches(mediaQuery.matches);

    // Create event listener
    const handler = (event: MediaQueryListEvent) => {
      setMatches(event.matches);
    };

    // Add event listener
    mediaQuery.addEventListener('change', handler);

    // Cleanup
    return () => {
      mediaQuery.removeEventListener('change', handler);
    };
  }, [query]);

  return matches;
}

// Predefined breakpoints matching MUI defaults
export function useIsMobile() {
  return useMediaQuery('(max-width: 599px)');
}

export function useIsTablet() {
  return useMediaQuery('(min-width: 600px) and (max-width: 899px)');
}

export function useIsDesktop() {
  return useMediaQuery('(min-width: 900px)');
}
