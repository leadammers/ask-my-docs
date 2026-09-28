'use client';

import { XIcon } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { useState, useSyncExternalStore } from 'react';
import { Button } from '@/components/ui/button';
import { RETENTION_DAYS } from '@/lib/config';

// The one place that tells visitors how long their data is kept (T08b):
// a dismissible banner on the first visit and a permanent footer line.

const DISMISSED_KEY = 'retention-banner-dismissed';
const HIDDEN_ON = ['/demo-login'];

export const RETENTION_NOTICE = `Your notebooks are tied to this browser and deleted after ${RETENTION_DAYS} days without a visit.`;
export const CONFIDENTIALITY_NOTICE =
  "Please don't upload confidential documents — this demo runs on Gemini's free tier, which may use submitted content to improve Google's products.";

function readDismissed(): boolean {
  try {
    return window.localStorage.getItem(DISMISSED_KEY) === '1';
  } catch {
    return false;
  }
}

function writeDismissed(): void {
  try {
    window.localStorage.setItem(DISMISSED_KEY, '1');
  } catch {
    // Without storage the banner simply shows again next time.
  }
}

function useIsHidden(): boolean {
  const pathname = usePathname();
  return HIDDEN_ON.some(
    (path: string): boolean => pathname === path || pathname.startsWith(`${path}/`),
  );
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener('storage', onChange);
  return (): void => window.removeEventListener('storage', onChange);
}

export function RetentionBanner() {
  const isHidden = useIsHidden();
  // Reads localStorage after hydration; the server snapshot hides the banner,
  // so a visitor who dismissed it never sees it flash.
  const wasDismissed = useSyncExternalStore(subscribe, readDismissed, (): boolean => true);
  const [isDismissedNow, setIsDismissedNow] = useState(false);
  const isOpen = !wasDismissed && !isDismissedNow;

  if (isHidden || !isOpen) return null;

  return (
    <section
      aria-label="How your data is kept"
      className="bg-muted text-foreground border-border flex items-start gap-3 border-b px-4 py-3 text-sm"
    >
      <p className="flex-1">
        <strong className="font-medium">Anonymous demo.</strong> {RETENTION_NOTICE}{' '}
        {CONFIDENTIALITY_NOTICE}
      </p>
      <Button
        variant="ghost"
        size="icon"
        aria-label="Dismiss notice"
        onClick={(): void => {
          writeDismissed();
          setIsDismissedNow(true);
        }}
      >
        <XIcon />
      </Button>
    </section>
  );
}

export function RetentionFooter() {
  const isHidden = useIsHidden();
  if (isHidden) return null;

  return (
    <footer className="text-muted-foreground border-border border-t px-4 py-3 text-center text-xs">
      Anonymous demo — {RETENTION_NOTICE} Please don&apos;t upload confidential documents.
    </footer>
  );
}
