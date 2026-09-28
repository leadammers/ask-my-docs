'use client';

import Markdown, { defaultUrlTransform } from 'react-markdown';
import { CitationChip } from '@/components/chat/citation-chip';
import type { Citation } from '@/lib/chat/citations';
import { linkifyCitations } from '@/lib/chat/markdown';

type MessageMarkdownProps = { content: string; citations: Citation[] };

const CITATION_HREF = /^citation:(\d+)$/;

/**
 * Renders assistant answers as markdown without raw HTML or images, `[n]`
 * markers as citation chips, and links restricted to http(s)
 * (conventions/security.md §6/§9 — a source can carry injected markdown, so
 * nothing but text and safe links reaches the DOM).
 */
export function MessageMarkdown({ content, citations }: MessageMarkdownProps): React.JSX.Element {
  const byNumber = new Map(citations.map((citation) => [citation.n, citation]));

  return (
    <Markdown
      urlTransform={(url) => (CITATION_HREF.test(url) ? url : defaultUrlTransform(url))}
      components={{
        img: () => null,
        a: ({ href, children }) => {
          const citationMatch = href ? CITATION_HREF.exec(href) : null;
          if (citationMatch) {
            const citation = byNumber.get(Number(citationMatch[1]));
            return citation ? <CitationChip citation={citation} /> : <>{children}</>;
          }
          if (href && /^https?:\/\//i.test(href)) {
            return (
              <a href={href} target="_blank" rel="noopener noreferrer nofollow">
                {children}
              </a>
            );
          }
          return <>{children}</>;
        },
      }}
    >
      {linkifyCitations(content, citations)}
    </Markdown>
  );
}
