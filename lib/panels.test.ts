import { describe, expect, it } from 'vitest';
import {
  CHAT_PANEL_MIN_WIDTH_PX,
  PANEL_HANDLE_PX,
  SOURCES_PANEL_MIN_WIDTH_PX,
  clampPanelWidth,
  panelColumnsTemplate,
  sourcesPanelWidthBounds,
} from './panels';

describe('sourcesPanelWidthBounds', () => {
  it('leaves the chat its minimum and the sources their maximum', () => {
    const bounds = sourcesPanelWidthBounds(1216);

    expect(bounds.min).toBe(SOURCES_PANEL_MIN_WIDTH_PX);
    expect(bounds.max).toBe(1216 - PANEL_HANDLE_PX - CHAT_PANEL_MIN_WIDTH_PX);
  });

  it('never lets the maximum fall below the minimum in a narrow container', () => {
    const bounds = sourcesPanelWidthBounds(400);

    expect(bounds.max).toBe(SOURCES_PANEL_MIN_WIDTH_PX);
  });

  it('offers no room before the container has been measured', () => {
    const bounds = sourcesPanelWidthBounds(null);

    expect(bounds).toEqual({ min: SOURCES_PANEL_MIN_WIDTH_PX, max: SOURCES_PANEL_MIN_WIDTH_PX });
  });
});

describe('clampPanelWidth', () => {
  const bounds = { min: 208, max: 832 };

  it('keeps a width that is already inside the range', () => {
    expect(clampPanelWidth(420, bounds)).toBe(420);
  });

  it('stops at the minimum', () => {
    expect(clampPanelWidth(120, bounds)).toBe(208);
  });

  it('stops at the maximum', () => {
    expect(clampPanelWidth(900, bounds)).toBe(832);
  });
});

describe('panelColumnsTemplate', () => {
  it('starts from the default width so it tracks the root font size', () => {
    expect(panelColumnsTemplate(null)).toBe(`17rem ${PANEL_HANDLE_PX}px minmax(0,1fr)`);
  });

  it('uses the dragged width in px once there is one', () => {
    expect(panelColumnsTemplate(392)).toBe(`392px ${PANEL_HANDLE_PX}px minmax(0,1fr)`);
  });
});
