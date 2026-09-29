'use client';

import { useRef, useState } from 'react';
import { cn } from 'cn';
import { type PanelWidthBounds, clampPanelWidth, panelColumnsTemplate } from '@/lib/panels';

/** Arrow keys nudge the divider; with Shift they take a longer step. */
const KEYBOARD_STEP_PX = 16;
const KEYBOARD_STEP_FAST_PX = 64;

type PanelResizerProps = {
  /** The grid the columns sit in — the drag rewrites its template directly. */
  gridRef: React.RefObject<HTMLDivElement | null>;
  /** The column being resized, measured for the drag's starting point. */
  panelRef: React.RefObject<HTMLDivElement | null>;
  /** The committed width in px; `null` until the workspace has measured the default. */
  width: number | null;
  bounds: PanelWidthBounds;
  onResize: (width: number) => void;
};

/**
 * The invisible divider between the sources column and the chat. It is a
 * column of the grid like the panels are, so the two sides keep their own
 * scrollbars, and it looks like nothing at all until the pointer or the
 * keyboard is on it.
 *
 * A separator that can be focused is a window splitter to assistive technology:
 * it has to carry `aria-orientation` and a value range, and the arrow keys have
 * to do what the drag does — otherwise the width is mouse-only.
 */
export function PanelResizer({
  gridRef,
  panelRef,
  width,
  bounds,
  onResize,
}: PanelResizerProps): React.JSX.Element {
  const handleRef = useRef<HTMLDivElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>): void {
    const grid = gridRef.current;
    const panel = panelRef.current;
    const handle = handleRef.current;
    if (grid === null || panel === null || handle === null || event.button !== 0) {
      return;
    }
    // No text selection, no native touch scrolling: the pointer belongs to the
    // divider until it comes back up.
    event.preventDefault();
    // Rebound, because TypeScript does not carry the check above into the
    // nested handlers below.
    const gridElement = grid;
    const handleElement = handle;

    const startX = event.clientX;
    const startWidth = panel.getBoundingClientRect().width;
    let draggedWidth = startWidth;

    // The new template goes straight onto the element rather than through
    // `onResize`: a pointermove every frame re-rendering the chat and its whole
    // transcript makes the drag stutter. React is told once, on release, and
    // told the same value that is already on the element — so nothing jumps.
    function handlePointerMove(moveEvent: PointerEvent): void {
      draggedWidth = clampPanelWidth(startWidth + (moveEvent.clientX - startX), bounds);
      gridElement.style.gridTemplateColumns = panelColumnsTemplate(draggedWidth);
    }

    function handlePointerEnd(): void {
      handleElement.removeEventListener('pointermove', handlePointerMove);
      handleElement.removeEventListener('pointerup', handlePointerEnd);
      handleElement.removeEventListener('pointercancel', handlePointerEnd);
      setIsDragging(false);
      onResize(draggedWidth);
    }

    handleElement.setPointerCapture(event.pointerId);
    handleElement.addEventListener('pointermove', handlePointerMove);
    handleElement.addEventListener('pointerup', handlePointerEnd);
    handleElement.addEventListener('pointercancel', handlePointerEnd);
    setIsDragging(true);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>): void {
    const step = event.shiftKey ? KEYBOARD_STEP_FAST_PX : KEYBOARD_STEP_PX;
    let delta = 0;
    if (event.key === 'ArrowLeft') {
      delta = -step;
    } else if (event.key === 'ArrowRight') {
      delta = step;
    } else {
      return;
    }

    const panel = panelRef.current;
    if (panel === null) {
      return;
    }
    event.preventDefault();
    // Measured rather than taken from `width`, which is still the default until
    // something has been committed.
    onResize(clampPanelWidth(panel.getBoundingClientRect().width + delta, bounds));
  }

  return (
    <div
      ref={handleRef}
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize sources panel"
      aria-valuemin={Math.round(bounds.min)}
      aria-valuemax={Math.round(bounds.max)}
      aria-valuenow={width === null ? undefined : Math.round(width)}
      tabIndex={0}
      onPointerDown={handlePointerDown}
      onKeyDown={handleKeyDown}
      className="group flex h-full cursor-col-resize touch-none items-center justify-center outline-none"
    >
      {/* A hairline that stays transparent until the divider is hovered, focused
          or dragged — the default layout is the two panels and a gutter. It is
          always the same width, so nothing shifts when it appears, and the
          states hang off the column rather than the line: nobody hovers a
          two-pixel target. */}
      <div
        aria-hidden="true"
        className={cn(
          'h-full w-0.5 rounded-full bg-transparent transition-colors',
          isDragging ? 'bg-primary' : 'group-hover:bg-border group-focus-visible:bg-primary',
        )}
      />
    </div>
  );
}
