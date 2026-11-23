/**
 * 块手柄拖拽：整组拖动、落点线、目录投放、自动滚动。
 * 手势结束才发 moveBlocks / onDropToOutline；取消不发命令。
 */

import type { TocDropTarget, TocPosition } from '../../core/toc.js';
import { clientToLocal } from '../geometry.js';
import { clearOutlineMarks, createDropLine, setBodyDragging } from './overlay.js';
import type { Gesture, PointerContext } from './types.js';

export function startBlockDrag(context: PointerContext, event: PointerEvent, handle: HTMLElement): Gesture | null {
  const { store, host, options } = context;
  const blockEl = handle.closest<HTMLElement>('.block');
  const id = blockEl?.dataset.id;
  if (!id) return null;

  const selected = store.selection.blockIds;
  const ids = selected.includes(id) && selected.length > 1 ? [...selected] : [id];
  store.setSelection({ blockIds: ids, activeId: id });

  const line = createDropLine(host);
  const outline = document.querySelector<HTMLElement>('#outline');
  const workspace = host.closest<HTMLElement>('.workspace');
  let lastX = event.clientX;
  let lastY = event.clientY;
  let moved = false;
  let frame = 0;

  const blocks = (): HTMLElement[] => [...host.querySelectorAll<HTMLElement>('.block')];

  const overOutline = (x: number, y: number): boolean => {
    if (!outline) return false;
    const rect = outline.getBoundingClientRect();
    return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
  };

  const outlineHitAt = (x: number, y: number): { target: TocDropTarget | null; item: HTMLElement | null } => {
    const el = document.elementFromPoint(x, y);
    if (!el) return { target: null, item: null };
    if (el.closest('[data-toc-tail]')) return { target: null, item: null };
    const item = el.closest<HTMLElement>('[data-toc-id]');
    const entryId = item?.dataset.tocId;
    if (!item || !entryId) return { target: null, item: null };
    const rect = item.getBoundingClientRect();
    const ratio = (y - rect.top) / Math.max(1, rect.height);
    const position: TocPosition = ratio < 0.3 ? 'before' : ratio > 0.7 ? 'after' : 'inside';
    return { target: { entryId, position }, item };
  };

  const targetAt = (clientY: number): { id: string; before: boolean } | null => {
    for (const el of blocks()) {
      const rect = el.getBoundingClientRect();
      if (clientY >= rect.top && clientY <= rect.bottom) {
        const blockId = el.dataset.id;
        if (!blockId) continue;
        return { id: blockId, before: clientY < rect.top + rect.height / 2 };
      }
    }
    return null;
  };

  const autoScroll = (): void => {
    if (outline && overOutline(lastX, lastY)) {
      const rect = outline.getBoundingClientRect();
      const edge = 40;
      if (lastY < rect.top + edge) outline.scrollTop -= 12;
      else if (lastY > rect.bottom - edge) outline.scrollTop += 12;
    } else if (workspace) {
      const rect = workspace.getBoundingClientRect();
      const edge = 48;
      if (lastY < rect.top + edge) workspace.scrollTop -= 18;
      else if (lastY > rect.bottom - edge) workspace.scrollTop += 18;
    }
    frame = requestAnimationFrame(autoScroll);
  };

  const onWheel = (wheelEvent: WheelEvent): void => {
    wheelEvent.preventDefault();
    if (workspace) workspace.scrollTop += wheelEvent.deltaY;
  };

  const cleanup = (): void => {
    cancelAnimationFrame(frame);
    frame = 0;
    document.removeEventListener('wheel', onWheel);
    setBodyDragging(false);
    clearOutlineMarks(outline);
    line.remove();
  };

  setBodyDragging(true);
  frame = requestAnimationFrame(autoScroll);
  document.addEventListener('wheel', onWheel, { passive: false });

  return {
    move(moveEvent: PointerEvent): void {
      moved = true;
      lastX = moveEvent.clientX;
      lastY = moveEvent.clientY;
      const inOutline = overOutline(lastX, lastY);
      outline?.classList.toggle('is-drop-target', inOutline);
      if (inOutline) {
        line.hidden = true;
        clearOutlineMarks(outline);
        outline?.classList.add('is-drop-target');
        const hit = outlineHitAt(lastX, lastY);
        if (hit.item && hit.target) {
          const suffix = hit.target.position === 'before' ? 'drop-before' : hit.target.position === 'after' ? 'drop-after' : 'drop-inside';
          hit.item.classList.add(suffix);
        } else {
          outline?.querySelector('[data-toc-tail]')?.classList.add('is-active');
        }
        return;
      }
      clearOutlineMarks(outline);
      const target = targetAt(lastY);
      if (!target || ids.includes(target.id)) {
        line.hidden = true;
        return;
      }
      const el = host.querySelector<HTMLElement>(`.block[data-id="${target.id}"]`);
      if (!el) return;
      const rect = el.getBoundingClientRect();
      line.hidden = false;
      line.style.top = `${clientToLocal(host, 0, target.before ? rect.top : rect.bottom).y}px`;
    },
    finish(upEvent: PointerEvent): void {
      cleanup();
      if (!moved) return;
      if (overOutline(upEvent.clientX, upEvent.clientY) && options.onDropToOutline) {
        const hit = outlineHitAt(upEvent.clientX, upEvent.clientY);
        options.onDropToOutline(ids, hit.target);
        return;
      }
      const target = targetAt(upEvent.clientY);
      if (!target || ids.includes(target.id)) return;
      const current = store.doc.blocks.map((block) => block.id);
      const rest = current.filter((blockId) => !ids.includes(blockId));
      const targetIndex = rest.indexOf(target.id);
      if (targetIndex < 0) return;
      const at = target.before ? targetIndex : targetIndex + 1;
      store.dispatch(() => [{ t: 'moveBlocks', ids, at }], {
        blockIds: ids,
        activeId: ids[ids.length - 1] ?? null,
      });
    },
    cancel(): void {
      cleanup();
    },
    moved(): boolean {
      return moved;
    },
  };
}
