/** 通用颜色面板定位与显隐。 */

import { syncColorPalette } from './colorPalette.js';

export interface ColorPanelIds {
  panelId: string;
  inputId: string;
  anchorId: string;
  caretId?: string;
}

export function positionColorPanel(panel: HTMLElement, anchor: HTMLElement, caret?: HTMLElement | null): void {
  panel.hidden = false;
  const rect = anchor.getBoundingClientRect();
  const bottom = (caret ?? anchor).getBoundingClientRect().bottom;
  const width = panel.offsetWidth;
  const centered = rect.left + rect.width / 2 - width / 2;
  panel.style.left = `${Math.max(8, Math.min(window.innerWidth - width - 8, centered))}px`;
  panel.style.top = `${bottom + 6}px`;
  panel.style.transform = 'none';
}

export function openColorPanel(ids: ColorPanelIds): HTMLInputElement | null {
  const panel = document.querySelector<HTMLElement>(`#${ids.panelId}`);
  const anchor = document.querySelector<HTMLElement>(`#${ids.anchorId}`);
  const input = document.querySelector<HTMLInputElement>(`#${ids.inputId}`);
  if (!panel || !anchor || !input) return null;
  const caret = ids.caretId ? document.querySelector<HTMLElement>(`#${ids.caretId}`) : null;
  positionColorPanel(panel, anchor, caret);
  input.focus();
  return input;
}

export function setPanelColor(inputId: string, color: string): void {
  const input = document.querySelector<HTMLInputElement>(`#${inputId}`);
  if (input) input.value = color;
  syncColorPalette(inputId);
}

export function closeColorPanels(selector = '.color-panel, .style-panel, #comment-panel'): void {
  document.querySelectorAll<HTMLElement>(selector).forEach((panel) => { panel.hidden = true; });
}
