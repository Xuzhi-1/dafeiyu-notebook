/**
 * 注释拖动排序：只处理同一注释展示区内部的手柄拖动。
 */

import { moveNoteOp } from '../../core/notes.js';
import type { Store } from '../../core/store.js';

export function attachCommentDrag(host: HTMLElement, store: Store, isEditing: () => boolean): void {
  let dragId: string | null = null;
  const lineOf = (target: EventTarget | null): HTMLElement | null =>
    target instanceof Element ? target.closest<HTMLElement>('.comment-line[data-comment-id]') : null;

  host.addEventListener('dragstart', (event) => {
    if (isEditing()) return;
    const line = lineOf(event.target);
    if (!line?.dataset.commentId) return;
    dragId = line.dataset.commentId;
    line.classList.add('is-dragging');
    host.classList.add('is-dragging');
    document.body.classList.add('is-comment-dragging');
    const color = getComputedStyle(line).getPropertyValue('--comment-color').trim();
    if (color) host.style.setProperty('--drag-line-color', color);
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', dragId);
    }
  });

  host.addEventListener('dragend', () => {
    dragId = null;
    document.body.classList.remove('is-comment-dragging');
    host.classList.remove('is-dragging');
    host.style.removeProperty('--drag-line-color');
    host.querySelectorAll('.is-dragging, .drag-over, .is-drop-target').forEach((el) => {
      el.classList.remove('is-dragging', 'drag-over', 'is-drop-target');
    });
  });

  host.addEventListener('dragover', (event) => {
    if (!dragId) return;
    const line = lineOf(event.target);
    const target = event.target;
    const tail = target instanceof Element ? target.closest<HTMLElement>('[data-comment-drop-tail]') : null;
    if (!line && !tail && target !== host) return;
    event.preventDefault();
    host.querySelectorAll('.drag-over, .is-drop-target').forEach((el) => {
      el.classList.remove('drag-over', 'is-drop-target');
    });
    if (tail) tail.classList.add('is-drop-target');
    else if (line && line.dataset.commentId !== dragId) line.classList.add('drag-over');
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
  });

  host.addEventListener('drop', (event) => {
    if (!dragId) return;
    const line = lineOf(event.target);
    const targetId = line?.dataset.commentId;
    const source = dragId;
    if (!targetId) {
      const lines = [...host.querySelectorAll<HTMLElement>('.comment-line[data-comment-id]')];
      const last = lines[lines.length - 1];
      if (last?.dataset.commentId && last.dataset.commentId !== source) {
        event.preventDefault();
        const target = last.dataset.commentId;
        store.dispatch(() => moveNoteOp(store.doc, source, target, true));
      }
    } else if (targetId !== source) {
      event.preventDefault();
      const rect = line.getBoundingClientRect();
      const after = event.clientY > rect.top + rect.height / 2;
      store.dispatch(() => moveNoteOp(store.doc, source, targetId, after));
    }
    dragId = null;
    document.body.classList.remove('is-comment-dragging');
    host.classList.remove('is-dragging');
  });
}
