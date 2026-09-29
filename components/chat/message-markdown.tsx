'use client';

import Markdown, { defaultUrlTransform } from 'react-markdown';
import { createContext, useContext } from 'react';
import { CitationChip } from '@/components/chat/citation-chip';
import type { Citation } from '@/lib/chat/citations';
import { linkifyCitations } from '@/lib/chat/markdown';

type MessageMarkdownProps = {
  content: string;
  citations: Citation[];
  onCitationOpen?: (citation: Citation, trigger: HTMLElement) => void;
};

type CitationLookup = {
  byNumber: Map<number, Citation>;
  onOpen?: (citation: Citation, trigger: HTMLElement) => void;
};

const CITATION_HREF = /^citation:(\d+)$/;

const CitationLookupContext = createContext<CitationLookup>({ byNumber: new Map() });

/**
 * The element renderers live at module scope and read their per-answer data from
 * context. react-markdown uses each entry of `components` as the JSX *type*, so a
 * renderer defined inside the component is a new type on every render and React
 * unmounts and remounts the whole link — which destroys the citation chip's DOM
 * node mid-interaction (its focus, and any handle held to it, goes with it).
 */
function MarkdownImage(): null {
  return null;
}

function MarkdownLink({ href, children }: React.ComponentProps<'a'>): React.JSX.Element {
  const { byNumber, onOpen } = useContext(CitationLookupContext);
  const citationMatch = href ? CITATION_HREF.exec(href) : null;

  if (citationMatch) {
    const citation = byNumber.get(Number(citationMatch[1]));
    if (!citation) return <>{children}</>;
    if (!onOpen) return <CitationChip citation={citation} />;
    return <CitationChip citation={citation} onOpen={onOpen} />;
  }

  if (href && /^https?:\/\//i.test(href)) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer nofollow">
        {children}
      </a>
    );
  }

  return <>{children}</>;
}

const COMPONENTS = { img: MarkdownImage, a: MarkdownLink };

function keepCitationHref(url: string): string {
  return CITATION_HREF.test(url) ? url : defaultUrlTransform(url);
}

/**
 * Renders assistant answers as markdown without raw HTML or images, `[n]`
 * markers as citation chips, and links restricted to http(s)
 * (conventions/security.md §6/§9 — a source can carry injected markdown, so
 * nothing but text and safe links reaches the DOM).
 */
export function MessageMarkdown({
  content,
  citations,
  onCitationOpen,
}: MessageMarkdownProps): React.JSX.Element {
  const byNumber = new Map(citations.map((citation) => [citation.n, citation]));

  return (
    <CitationLookupContext.Provider value={{ byNumber, onOpen: onCitationOpen }}>
      <Markdown urlTransform={keepCitationHref} components={COMPONENTS}>
        {linkifyCitations(content, citations)}
      </Markdown>
    </CitationLookupContext.Provider>
  );
}
