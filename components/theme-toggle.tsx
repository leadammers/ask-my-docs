'use client';

import { MonitorIcon, MoonIcon, SunIcon } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useSyncExternalStore } from 'react';
import { Button } from '@/components/ui/button';

const THEMES = ['system', 'light', 'dark'] as const;
type ThemeChoice = (typeof THEMES)[number];

const LABELS: Record<ThemeChoice, string> = {
  system: 'System',
  light: 'Light',
  dark: 'Dark',
};

const ICONS: Record<ThemeChoice, typeof SunIcon> = {
  system: MonitorIcon,
  light: SunIcon,
  dark: MoonIcon,
};

/** Cycles system → light → dark, so the "follow the system" default stays reachable. */
const NEXT_THEME: Record<ThemeChoice, ThemeChoice> = {
  system: 'light',
  light: 'dark',
  dark: 'system',
};

function isThemeChoice(value: string | undefined): value is ThemeChoice {
  return value !== undefined && (THEMES as readonly string[]).includes(value);
}

/** Nothing to subscribe to — the answer flips once, when hydration finishes. */
function subscribeToNothing(): () => void {
  return () => {};
}

/**
 * `false` on the server and during hydration, `true` afterwards. The stored
 * theme is unreadable on the server, so the first client render falls back to
 * the same "system" value the server produced — no hydration mismatch.
 */
function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribeToNothing,
    () => true,
    () => false,
  );
}

export function ThemeToggle(): React.JSX.Element {
  const { theme, setTheme } = useTheme();
  const isHydrated = useHydrated();

  const current: ThemeChoice = isHydrated && isThemeChoice(theme) ? theme : 'system';
  const next = NEXT_THEME[current];
  const Icon = ICONS[current];

  return (
    <Button
      variant="ghost"
      size="icon"
      type="button"
      aria-label={`${LABELS[current]} theme. Switch to ${LABELS[next].toLowerCase()} theme`}
      onClick={() => setTheme(next)}
    >
      <Icon />
    </Button>
  );
}
