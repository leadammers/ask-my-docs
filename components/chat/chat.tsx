'use client';

import { DefaultChatTransport, type UIMessage } from 'ai';
import { useChat } from '@ai-sdk/react';
import { useState } from 'react';
import { toast } from 'sonner';
import { clearChat } from '@/app/n/[id]/chat-actions';
import { MessageMarkdown } from '@/components/chat/message-markdown';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import type { Citation } from '@/lib/chat/citations';
import { userMessage } from '@/lib/errors';

type ChatMessage = UIMessage<unknown, { citations: Citation[] }>;

type ChatProps = {
  notebookId: string;
  sourceIds: string[];
  initialMessages: ChatMessage[];
};

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

export function Chat({ notebookId, sourceIds, initialMessages }: ChatProps): React.JSX.Element {
  const [question, setQuestion] = useState('');
  const [isClearing, setIsClearing] = useState(false);
  const { messages, sendMessage, status, setMessages } = useChat({
    messages: initialMessages,
    transport: new DefaultChatTransport({
      api: '/api/chat',
      body: { notebookId, sourceIds },
    }),
    onError: (chatError) => {
      toast.error(chatError.message || 'Something went wrong. Please try again.');
    },
  });

  const hasSources = sourceIds.length > 0;
  const isBusy = status === 'submitted' || status === 'streaming';
  const isDisabled = isBusy || !hasSources;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const text = question.trim();
    if (!text || isDisabled) return;
    setQuestion('');
    await sendMessage({ text });
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
    <div className="flex flex-1 flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Chat</h2>
        <Button
          variant="ghost"
          size="sm"
          type="button"
          disabled={isClearing || messages.length === 0}
          onClick={handleClear}
        >
          Clear chat
        </Button>
      </div>
      <ScrollArea className="h-96 rounded-lg border p-4">
        <div className="flex flex-col gap-4">
          {messages.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              {hasSources
                ? 'Ask a question about your sources.'
                : 'Add a source and wait for it to finish processing to start chatting.'}
            </p>
          ) : null}
          {messages.map((message) => (
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
                  <MessageMarkdown content={textOf(message)} citations={citationsOf(message)} />
                )}
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
      <form onSubmit={handleSubmit} className="flex gap-2">
        <Textarea
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder={
            hasSources ? 'Ask a question about your sources...' : 'Add a source before you can chat'
          }
          className="min-h-10 flex-1"
          disabled={isDisabled}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }
          }}
        />
        <Button type="submit" disabled={isDisabled || question.trim().length === 0}>
          Send
        </Button>
      </form>
    </div>
  );
}
