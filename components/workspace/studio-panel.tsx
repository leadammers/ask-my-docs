'use client';

import { SparklesIcon } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetDescription,
  SheetHeader,
  SheetPopup,
  SheetTitle,
} from '@/components/ui/sheet';
import { StudioCard } from '@/components/workspace/studio-card';

const STUDIO_ITEMS = [
  {
    title: 'Notebook guide',
    description: 'A written overview of what your sources say.',
  },
  {
    title: 'Audio overview',
    description: 'A spoken summary of the notebook you can listen to.',
  },
  {
    title: 'Notes',
    description: 'Answers and passages you saved while reading.',
  },
] as const;

/** The header's Studio button and the drawer it opens. Studio is a surface, not a third column. */
export function StudioPanel(): React.JSX.Element {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <Button variant="outline" size="sm" type="button" onClick={() => setIsOpen(true)}>
        <SparklesIcon />
        Studio
      </Button>
      <Sheet open={isOpen} onOpenChange={setIsOpen}>
        <SheetPopup side="left">
          <SheetHeader>
            <SheetTitle>Studio</SheetTitle>
            <SheetDescription>Coming features that read your sources for you.</SheetDescription>
          </SheetHeader>
          <div className="flex min-h-0 flex-1 flex-col gap-4">
            {STUDIO_ITEMS.map((item) => (
              <StudioCard key={item.title} title={item.title} description={item.description}>
                <p className="text-muted-foreground text-sm">Coming soon.</p>
              </StudioCard>
            ))}
          </div>
        </SheetPopup>
      </Sheet>
    </>
  );
}
