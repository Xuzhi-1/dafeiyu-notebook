/**
 * 空白框选：起点固定在纸张坐标，滚动时按当前纸张位置重算，选框不漂移。
 */

import { createMarqueeBox, setBodyDragging } from './overlay.js';
import { altSelectionActive } from '../altSelect.js';
import { clientToLocal, zoomOf } from '../geometry.js';
import type { Gesture, PointerContext } from './types.js';

export interface MarqueeOptions {
  /** 先不选中，等超过拖动阈值后再开始框选。 */
  deferSelection?: boolean;
  /** 没有发生拖动时视为点击。 */
  onTap?: () => void;
}

export function startMarquee(
  context: PointerContext,
  event: PointerEvent,
  marqueeOptions: MarqueeOptions = {},
): Gesture {
  const { store, host } = context;
  const workspace = host.closest<HTMLElement>('.workspace');
  const box = createMarqueeBox(host);
  // Alt 框选是“切换框内区块”；普通框选替换选区。
  const additive = altSelectionActive(event.altKey);
  const base = additive ? new Set(store.selection.blockIds) : new Set<string>();
  const start = clientToLocal(host, event.clientX, event.clientY);
  const startX = start.x;
  const startY = start.y;
  const zoom = zoomOf(host);
  const blockRects = [...host.querySelectorAll<HTMLElement>('.block')].map((element) => {
    const rect = element.getBoundingClientRect();
    const topLeft = clientToLocal(host, rect.left, rect.top);
    return {
      id: element.dataset.id,
      left: topLeft.x,
      top: topLeft.y,
      right: topLeft.x + rect.width / zoom,
      bottom: topLeft.y + rect.height / zoom,
    };
  });
  let lastClientX = event.clientX;
  let lastClientY = event.clientY;
  let moved = false;
  let frame = 0;
  const deferSelection = Boolean(marqueeOptions.deferSelection);

  const selectInRect = (left: number, top: number, right: number, bottom: number): void => {
    const ids = new Set(base);
    for (const rect of blockRects) {
      if (!rect.id) continue;
      if (rect.right >= left && rect.left <= right
        && rect.bottom >= top && rect.top <= bottom) {
        if (additive && base.has(rect.id)) ids.delete(rect.id);
        else ids.add(rect.id);
      }
    }
    const blockIds = store.doc.blocks.map((block) => block.id).filter((id) => ids.has(id));
    store.setSelection({ blockIds, activeId: blockIds[blockIds.length - 1] ?? null });
  };

  const paint = (): void => {
    const current = clientToLocal(host, lastClientX, lastClientY);
    const left = Math.min(startX, current.x);
    const top = Math.min(startY, current.y);
    const width = Math.abs(current.x - startX);
    const height = Math.abs(current.y - startY);
    box.style.left = `${left}px`;
    box.style.top = `${top}px`;
    box.style.width = `${width}px`;
    box.style.height = `${height}px`;
    if (deferSelection && !moved) return;
    selectInRect(left, top, left + width, top + height);
  };

  const autoScroll = (): void => {
    if (!workspace) { frame = 0; return; }
    if (!moved) {
      frame = requestAnimationFrame(autoScroll);
      return;
    }
    const rect = workspace.getBoundingClientRect();
    const edge = 40;
    if (lastClientY < rect.top + edge) workspace.scrollTop -= 14;
    else if (lastClientY > rect.bottom - edge) workspace.scrollTop += 14;
    paint();
    frame = requestAnimationFrame(autoScroll);
  };

  setBodyDragging(false);
  paint();
  frame = requestAnimationFrame(autoScroll);

  const cleanup = (): void => {
    cancelAnimationFrame(frame);
    frame = 0;
    box.remove();
  };

  return {
    move(moveEvent: PointerEvent): void {
      lastClientX = moveEvent.clientX;
      lastClientY = moveEvent.clientY;
      const current = clientToLocal(host, lastClientX, lastClientY);
      if (Math.abs(current.x - startX) > 2 || Math.abs(current.y - startY) > 2) moved = true;
      paint();
    },
    finish(): void {
      cleanup();
      if (!moved) marqueeOptions.onTap?.();
    },
    cancel(): void {
      cleanup();
      store.setSelection({ blockIds: [], activeId: null });
    },
    moved(): boolean {
      return moved;
    },
  };
}
