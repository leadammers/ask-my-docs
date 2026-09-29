/**
 * Geometry of the workspace's two columns: where they start and how far the
 * divider may be dragged. All of it is pure — the component measures the DOM
 * and hands the numbers in — so the rules can be tested without a browser.
 */

/** The sources column's starting width. In rem, so it tracks the reader's font size. */
export const DEFAULT_SOURCES_PANEL_WIDTH = '17rem';

/**
 * The divider's own column. It replaces the `gap-6` the two columns used to sit
 * apart by, so the layout looks unchanged until someone reaches for the handle.
 */
export const PANEL_HANDLE_PX = 24;

/** Below this the source list's checkbox rows stop fitting. */
export const SOURCES_PANEL_MIN_WIDTH_PX = 208;

/** The chat keeps at least this much: an answer needs a readable measure. */
export const CHAT_PANEL_MIN_WIDTH_PX = 360;

export type PanelWidthBounds = { min: number; max: number };

/**
 * Where the sources column may stop inside a container this wide. Before the
 * first measurement (`null`) there is no room to give, so the minimum is also
 * the maximum — a caller that measured nothing cannot widen the panel by
 * accident.
 */
export function sourcesPanelWidthBounds(containerWidth: number | null): PanelWidthBounds {
  const min = SOURCES_PANEL_MIN_WIDTH_PX;
  if (containerWidth === null) {
    return { min, max: min };
  }
  return { min, max: Math.max(min, containerWidth - PANEL_HANDLE_PX - CHAT_PANEL_MIN_WIDTH_PX) };
}

export function clampPanelWidth(desired: number, bounds: PanelWidthBounds): number {
  return Math.min(Math.max(desired, bounds.min), bounds.max);
}

/**
 * The grid's columns: the sources panel, the divider, then the chat. One
 * function because the drag writes the same template onto the element that the
 * render does, and the two must not drift.
 */
export function panelColumnsTemplate(sourcesWidth: number | null): string {
  const sources = sourcesWidth === null ? DEFAULT_SOURCES_PANEL_WIDTH : `${sourcesWidth}px`;
  return `${sources} ${PANEL_HANDLE_PX}px minmax(0,1fr)`;
}
