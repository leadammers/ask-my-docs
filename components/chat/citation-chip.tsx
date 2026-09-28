'use client';

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { Citation } from '@/lib/chat/citations';

type CitationChipProps = { citation: Citation };

function formatPages(pageFrom: number | null, pageTo: number | null): string {
  if (pageFrom == null) return '';
  return pageFrom === pageTo ? `p. ${pageFrom}` : `p. ${pageFrom}-${pageTo}`;
}

export function CitationChip({ citation }: CitationChipProps): React.JSX.Element {
  const pages = formatPages(citation.pageFrom, citation.pageTo);
  return (
    <Tooltip>
      <TooltipTrigger
        className="bg-muted text-muted-foreground mx-0.5 inline-flex size-4 -translate-y-0.5 items-center justify-center rounded-full text-[10px] font-medium"
        aria-label={`Citation ${citation.n}: ${citation.sourceTitle}${pages ? `, ${pages}` : ''}`}
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
