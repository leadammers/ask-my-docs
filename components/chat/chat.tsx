'use client';

import { DefaultChatTransport, type UIMessage } from 'ai';
import { useChat } from '@ai-sdk/react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { clearChat } from '@/app/n/[id]/chat-actions';
import { MessageMarkdown } from '@/components/chat/message-markdown';
import { TypingIndicator } from '@/components/chat/typing-indicator';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import type { Citation } from '@/lib/chat/citations';
import { userMessage } from '@/lib/errors';

type ChatMessage = UIMessage<unknown, { citations: Citation[] }>;

type ChatProps = {
  notebookId: string;
  /** The live source selection: what the next answer is grounded in. Never empty when sending. */
  sourceIds: string[];
  hasReadySources: boolean;
  initialMessages: ChatMessage[];
  onCitationOpen?: (citation: Citation, trigger: HTMLElement) => void;
  suggestedQuestions?: string[];
};

/** How far from the bottom the reader still counts as "following the answer". */
const SCROLL_BOTTOM_SLACK_PX = 48;

function isNearBottom(element: HTMLDivElement): boolean {
  const distanceFromBottom = element.scrollHeight - element.scrollTop - element.clientHeight;
  return distanceFromBottom <= SCROLL_BOTTOM_SLACK_PX;
}

function citationsOf(message: ChatMessage): Citation[] {
  const part = message.parts.find(
    (candidate): candidate is Extract<ChatMessage['parts'][number], { type: 'data-citations' }> =>
      candidate.type === 'data-citations',
  );
  return part?.data ?? [];
}

function textOf(message: ChatMessage): string {
  return message.parts
    .filter((part): part is Extract<typeof part, { type: 'text' }> => part.type === 'text')
    .map((part) => part.text)
    .join('');
}

/**
 * The composer's idle copy, in one place so the placeholder and the empty state
 * can never describe different situations. "No source selected" and "no source
 * ready" are different problems and need different instructions.
 */
function idleCopy(
  hasSelection: boolean,
  hasReadySources: boolean,
): { empty: string; placeholder: string } {
  if (hasSelection) {
    return {
      empty: 'Ask a question about your sources.',
      placeholder: 'Ask a question about your sources...',
    };
  }
  if (hasReadySources) {
    return {
      empty: 'Select at least one source to start chatting.',
      placeholder: 'Select a source to chat',
    };
  }
  return {
    empty: 'Add a source and wait for it to finish processing to start chatting.',
    placeholder: 'Add a source before you can chat',
  };
}

export function Chat({
  notebookId,
  sourceIds,
  hasReadySources,
  initialMessages,
  onCitationOpen,
  suggestedQuestions = [],
}: ChatProps): React.JSX.Element {
  const [question, setQuestion] = useState('');
  const [isClearing, setIsClearing] = useState(false);
  const viewportRef = useRef<HTMLDivElement>(null);
  // Auto-scroll follows the answer only while the reader is already at the bottom.
  const isFollowingAnswer = useRef(true);
  const { messages, sendMessage, status, setMessages, stop } = useChat({
    messages: initialMessages,
    // `notebookId` rides on every request; the selection is per-send (see `send`).
    transport: new DefaultChatTransport({ api: '/api/chat', body: { notebookId } }),
    onError: (chatError) => {
      toast.error(chatError.message || 'Something went wrong. Please try again.');
    },
  });

  const hasSelection = sourceIds.length > 0;
  const isStreaming = status === 'streaming';
  const isBusy = status === 'submitted' || isStreaming;
  const isDisabled = isBusy || !hasSelection;
  const { empty, placeholder } = idleCopy(hasSelection, hasReadySources);

  const lastMessage = messages[messages.length - 1];
  // `submitted` covers retrieval and time to the first token; an assistant draft
  // with no text yet covers answers whose citations arrive before the prose.
  const hasAnswerText = lastMessage?.role === 'assistant' && textOf(lastMessage).length > 0;
  const isAwaitingAnswer = isBusy && !hasAnswerText;
  // That textless draft would render as a blank bubble — the indicator replaces it.
  const renderedMessages =
    isAwaitingAnswer && lastMessage?.role === 'assistant' ? messages.slice(0, -1) : messages;

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    function handleScroll(): void {
      const element = viewportRef.current;
      if (element === null) return;
      isFollowingAnswer.current = isNearBottom(element);
    }

    viewport.addEventListener('scroll', handleScroll, { passive: true });
    return () => viewport.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    if (!isFollowingAnswer.current) return;
    const viewport = viewportRef.current;
    if (!viewport) return;
    // Jump, do not glide: tokens arrive many times a second and a queued smooth
    // scroll would lag behind the text. An instant jump needs no motion-reduce variant.
    viewport.scrollTop = viewport.scrollHeight;
  }, [messages, isAwaitingAnswer]);

  /** The one place the request body is assembled — the API requires at least one source. */
  function send(text: string): Promise<void> {
    return sendMessage({ text }, { body: { sourceIds } });
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const text = question.trim();
    if (!text || isDisabled) return;
    setQuestion('');
    await send(text);
  }

  async function handleClear(): Promise<void> {
    setIsClearing(true);
    try {
      const result = await clearChat(notebookId);
      if (!result.ok) {
        toast.error(userMessage(result.error));
        return;
      }
      setMessages([]);
    } finally {
      setIsClearing(false);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Chat</h2>
        <Button
          variant="ghost"
          size="sm"
          type="button"
          disabled={isClearing || isBusy || messages.length === 0}
          onClick={handleClear}
        >
          Clear chat
        </Button>
      </div>
      <ScrollArea className="min-h-0 flex-1 rounded-lg border p-4" viewportRef={viewportRef}>
        <div className="flex flex-col gap-4">
          {messages.length === 0 ? <p className="text-muted-foreground text-sm">{empty}</p> : null}
          {renderedMessages.map((message) => (
            <div key={message.id} className={message.role === 'user' ? 'text-right' : 'text-left'}>
              <div
                className={
                  message.role === 'user'
                    ? 'bg-primary text-primary-foreground inline-block rounded-lg px-3 py-2 text-sm'
                    : 'bg-muted inline-block rounded-lg px-3 py-2 text-left text-sm'
                }
              >
                {message.role === 'user' ? (
                  textOf(message)
                ) : (
                  <MessageMarkdown
                    content={textOf(message)}
                    citations={citationsOf(message)}
                    onCitationOpen={onCitationOpen}
                  />
                )}
              </div>
            </div>
          ))}
          {isAwaitingAnswer ? (
            <div className="text-left">
              <TypingIndicator />
            </div>
          ) : null}
        </div>
      </ScrollArea>
      {suggestedQuestions.length > 0 && messages.length === 0 ? (
        <div className="flex flex-wrap gap-2">
          {suggestedQuestions.map((suggestion) => (
            <Button
              key={suggestion}
              type="button"
              variant="outline"
              size="sm"
              disabled={isDisabled}
              onClick={() => void send(suggestion)}
            >
              {suggestion}
            </Button>
          ))}
        </div>
      ) : null}
      <form onSubmit={handleSubmit} className="flex gap-2">
        <Textarea
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder={placeholder}
          className="min-h-10 flex-1"
          disabled={isDisabled}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }
          }}
        />
        {isStreaming ? (
          <Button type="button" variant="outline" onClick={() => stop()}>
            Stop
          </Button>
        ) : null}
        <Button type="submit" disabled={isDisabled || question.trim().length === 0}>
          Send
        </Button>
      </form>
    </div>
  );
}
