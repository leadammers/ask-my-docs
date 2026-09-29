import { cn } from 'cn';

// Negative delays start each dot mid-cycle, so the wave reads left to right
// from the first frame instead of every dot sitting still for one cycle.
const DOT_DELAY_CLASSES = [
  '[animation-delay:-0.4s]',
  '[animation-delay:-0.2s]',
  '[animation-delay:0s]',
] as const;

/**
 * Stands in for the assistant's bubble until its first text token arrives,
 * so the wait between asking and the first word is not an empty pane.
 */
export function TypingIndicator(): React.JSX.Element {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Assistant is thinking"
      className="bg-muted inline-flex items-center gap-1.5 rounded-lg px-3 py-3.5"
    >
      {DOT_DELAY_CLASSES.map((delayClass: string) => (
        <span
          key={delayClass}
          aria-hidden="true"
          className={cn(
            'bg-muted-foreground animate-typing-dot size-2 rounded-full motion-reduce:animate-none',
            delayClass,
          )}
        />
      ))}
    </div>
  );
}
