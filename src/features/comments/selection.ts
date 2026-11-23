/** 注释框选：Alt+单击切换注释，Alt+拖动框选注释行。 */

import { altSelectionActive } from '../../editor/altSelect.js';

export interface CommentSelection {
  refresh(): void;
  clear(): void;
  select(ids: readonly string[]): void;
  ids(): string[];
}

export function attachCommentSelection(host: HTMLElement, clearBlocks: () => void): CommentSelection {
  const selected = new Set<string>();
  let suppressClick = false;
  let marquee: HTMLElement | null = null;

  const lines = (): HTMLElement[] => [...host.querySelectorAll<HTMLElement>('.comment-line[data-comment-id]')];

  const refresh = (): void => {
    for (const line of lines()) {
      const id = line.dataset.commentId;
      line.classList.toggle('is-selected', Boolean(id && selected.has(id)));
    }
  };

  const select = (ids: readonly string[]): void => {
    selected.clear();
    for (const id of ids) selected.add(id);
    refresh();
  };

  const clear = (): void => {
    if (!selected.size) return;
    selected.clear();
    refresh();
  };

  const toggle = (id: string): void => {
    if (selected.has(id)) selected.delete(id);
    else selected.add(id);
    refresh();
  };

  const selectInRect = (left: number, top: number, right: number, bottom: number): void => {
    for (const line of lines()) {
      const id = line.dataset.commentId;
      if (!id) continue;
      const rect = line.getBoundingClientRect();
      if (rect.right < left || rect.left > right || rect.bottom < top || rect.top > bottom) continue;
      if (selected.has(id)) selected.delete(id);
      else selected.add(id);
    }
    refresh();
  };

  host.addEventListener('pointerdown', (event) => {
    if (!altSelectionActive(event.altKey)) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    const line = target.closest<HTMLElement>('.comment-line[data-comment-id]');
    if (!line || !target.closest('[data-comment-ui]')) return;
    event.preventDefault();
    event.stopPropagation();
    clearBlocks();
    suppressClick = true;
    const startLineId = line.dataset.commentId ?? '';
    const startX = event.clientX;
    const startY = event.clientY;
    let moved = false;
    let left = startX;
    let top = startY;
    let right = startX;
    let bottom = startY;

    const move = (moveEvent: PointerEvent): void => {
      left = Math.min(startX, moveEvent.clientX);
      top = Math.min(startY, moveEvent.clientY);
      right = Math.max(startX, moveEvent.clientX);
      bottom = Math.max(startY, moveEvent.clientY);
      if (!moved && Math.abs(moveEvent.clientX - startX) <= 3 && Math.abs(moveEvent.clientY - startY) <= 3) return;
      moved = true;
      if (!marquee) {
        marquee = document.createElement('div');
        marquee.className = 'comment-marquee';
        document.body.appendChild(marquee);
      }
      marquee.style.left = `${left}px`;
      marquee.style.top = `${top}px`;
      marquee.style.width = `${right - left}px`;
      marquee.style.height = `${bottom - top}px`;
    };

    const finish = (): void => {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', finish);
      document.removeEventListener('pointercancel', cancel);
      marquee?.remove();
      marquee = null;
      if (moved) selectInRect(left, top, right, bottom);
      else if (startLineId) toggle(startLineId);
    };

    const cancel = (): void => {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', finish);
      document.removeEventListener('pointercancel', cancel);
      marquee?.remove();
      marquee = null;
    };

    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', finish);
    document.addEventListener('pointercancel', cancel);
  }, true);

  host.addEventListener('click', (event) => {
    if (!suppressClick) return;
    suppressClick = false;
    event.preventDefault();
    event.stopPropagation();
  }, true);

  document.addEventListener('pointerdown', (event) => {
    if (event.altKey) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (target.closest('[data-comment-ui], .toolbar, #comment-panel, #color-picker, .context-menu')) return;
    clear();
  }, true);

  return { refresh, clear, select, ids: () => [...selected] };
}
