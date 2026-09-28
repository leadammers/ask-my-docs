'use client';

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { formatCitationPages, type Citation } from '@/lib/chat/citations';

type CitationChipProps = {
  citation: Citation;
  /** Receives the chip itself, so the drawer can hand focus back to it on close. */
  onOpen?: (citation: Citation, trigger: HTMLElement) => void;
};

export function CitationChip({ citation, onOpen }: CitationChipProps): React.JSX.Element {
  const pages = formatCitationPages(citation.pageFrom, citation.pageTo);
  const label = `Citation ${citation.n}: ${citation.sourceTitle}${pages ? `, ${pages}` : ''}`;

  return (
    <Tooltip>
      <TooltipTrigger
        className="bg-muted text-muted-foreground hover:bg-accent focus-visible:ring-ring mx-0.5 inline-flex size-4 -translate-y-0.5 items-center justify-center rounded-full text-[10px] font-medium focus-visible:ring-2 focus-visible:outline-none"
        aria-label={onOpen ? `${label}. Open the cited passage` : label}
        onClick={onOpen ? (event) => onOpen(citation, event.currentTarget) : undefined}
      >
        {citation.n}
      </TooltipTrigger>
      <TooltipContent>
        <div className="flex max-w-xs flex-col gap-1">
          <p className="font-medium">
            {citation.sourceTitle}
            {pages ? `, ${pages}` : ''}
          </p>
          <p className="text-muted-foreground italic">&ldquo;{citation.quote}&rdquo;</p>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
