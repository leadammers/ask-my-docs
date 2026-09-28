import { describe, expect, it } from 'vitest';
import { extractQuestion, type UiMessage } from '@/lib/chat/request';

function userMessage(parts: UiMessage['parts']): UiMessage {
  return { id: 'm1', role: 'user', parts };
}

describe('extractQuestion', () => {
  it('joins multiple text parts of the latest user message', () => {
    const messages: UiMessage[] = [
      { id: 'a', role: 'assistant', parts: [{ type: 'text', text: 'earlier answer' }] },
      userMessage([
        { type: 'text', text: 'What does ' },
        { type: 'text', text: 'the report say?' },
      ]),
    ];
    expect(extractQuestion(messages)).toBe('What does the report say?');
  });

  it('uses the latest user message, not an earlier one', () => {
    const messages: UiMessage[] = [
      userMessage([{ type: 'text', text: 'first question' }]),
      { id: 'a', role: 'assistant', parts: [{ type: 'text', text: 'first answer' }] },
      userMessage([{ type: 'text', text: 'second question' }]),
    ];
    expect(extractQuestion(messages)).toBe('second question');
  });

  it('ignores non-text parts', () => {
    const messages: UiMessage[] = [
      userMessage([{ type: 'file' }, { type: 'text', text: 'the actual question' }]),
    ];
    expect(extractQuestion(messages)).toBe('the actual question');
  });

  it('returns null when there is no user message', () => {
    const messages: UiMessage[] = [
      { id: 'a', role: 'assistant', parts: [{ type: 'text', text: 'hi' }] },
    ];
    expect(extractQuestion(messages)).toBeNull();
  });

  it('returns null for a whitespace-only question', () => {
    expect(extractQuestion([userMessage([{ type: 'text', text: '   ' }])])).toBeNull();
  });
});
