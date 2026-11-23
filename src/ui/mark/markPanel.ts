/**
 * 标记样式面板：图标 / 颜色，应用后关闭。
 * 颜色选择器由外部传入打开函数，避免这里依赖具体 UI。
 */

import type { Store } from '../../core/store.js';
import { markForBlock, setMarkOp } from '../../core/notes.js';
import type { Mark } from '../../core/types.js';
import { syncColorPalette } from '../colorPalette.js';
import { focusToolbarPanel } from '../panelFocus.js';
import { loadMarkAppearance } from './markAppearance.js';
import { renderMarkIcons } from './markIcons.js';

export function openMarkPanel(store: Store, blockId: string | null): void {
  const panel = document.querySelector<HTMLElement>('#mark-panel');
  if (!panel) return;
  const existing = blockId ? markForBlock(store.doc, blockId) : undefined;
  const appearance = loadMarkAppearance();
  const iconValue = existing?.icon ?? appearance.icon;
  const colorValue = existing?.color ?? appearance.color;
  const icon = document.querySelector<HTMLInputElement>('#mark-icon');
  const color = document.querySelector<HTMLInputElement>('#mark-color');
  const swatch = document.querySelector<HTMLElement>('#mark-color-btn');
  if (icon) icon.value = iconValue;
  renderMarkIcons(iconValue);
  const addForm = document.querySelector<HTMLElement>('#mark-icon-add-form');
  if (addForm) addForm.hidden = true;
  if (color) color.value = colorValue;
  if (swatch) swatch.style.background = colorValue;
  syncColorPalette('mark-color');
  panel.hidden = false;
  positionMarkPanel(panel);
  focusToolbarPanel(panel);
}

function positionMarkPanel(panel: HTMLElement): void {
  const anchor = document.querySelector<HTMLElement>('#btn-mark');
  const caret = document.querySelector<HTMLElement>('#btn-mark-more');
  if (!anchor) return;
  const rect = anchor.getBoundingClientRect();
  const bottom = (caret ?? anchor).getBoundingClientRect().bottom;
  const width = panel.offsetWidth;
  const centered = rect.left + rect.width / 2 - width / 2;
  panel.style.left = `${Math.max(8, Math.min(window.innerWidth - width - 8, centered))}px`;
  panel.style.top = `${bottom + 6}px`;
  panel.style.transform = 'none';
}

export function applyMarkPanel(store: Store, blockIds: readonly string[]): void {
  const ids = blockIds.filter((id) => store.doc.blocks.some((block) => block.id === id));
  if (!ids.length) return;
  const existing = markForBlock(store.doc, ids[0]);
  const mark: Mark = {
    kind: 'mark',
    icon: document.querySelector<HTMLInputElement>('#mark-icon')?.value ?? 'star',
    shape: 'circle',
    color: document.querySelector<HTMLInputElement>('#mark-color')?.value ?? '#ED7D31',
    label: existing?.label || '标记',
  };
  store.dispatch(() => setMarkOp(store.doc, ids, mark));
  const panel = document.querySelector<HTMLElement>('#mark-panel');
  if (panel) panel.hidden = true;
}

export function closeMarkPanel(): void {
  const panel = document.querySelector<HTMLElement>('#mark-panel');
  if (panel) panel.hidden = true;
}

export function removeMarkPanel(store: Store, blockIds: readonly string[]): void {
  const ids = blockIds.filter((id) => store.doc.blocks.some((block) => block.id === id));
  if (!ids.length) return;
  store.dispatch(() => setMarkOp(store.doc, ids, null));
  closeMarkPanel();
}
