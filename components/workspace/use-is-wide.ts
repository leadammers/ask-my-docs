'use client';

import { useSyncExternalStore } from 'react';

/** Tailwind's `lg` breakpoint, in rem so it tracks the root font size like Tailwind does. */
const WIDE_QUERY = '(min-width: 64rem)';

function subscribeToWide(onChange: () => void): () => void {
  const mediaQuery = window.matchMedia(WIDE_QUERY);
  mediaQuery.addEventListener('change', onChange);
  return () => mediaQuery.removeEventListener('change', onChange);
}

function getIsWide(): boolean {
  return window.matchMedia(WIDE_QUERY).matches;
}

/** A server has no viewport, so it renders the narrow layout and hydration matches it. */
function getIsWideServer(): boolean {
  return false;
}

/**
 * Which workspace layout applies. The two layouts are different component
 * trees, not the same markup with different classes: Base UI's inactive
 * `Tabs.Panel` carries `inert`, which no CSS can lift, so the side-by-side
 * layout cannot be reached with a `lg:` variant alone.
 */
export function useIsWide(): boolean {
  return useSyncExternalStore(subscribeToWide, getIsWide, getIsWideServer);
}
