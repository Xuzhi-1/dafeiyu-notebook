/**
 * 组注释覆盖层：右侧范围虚线 + 组内区块的标记 class。
 * 只负责 DOM 投影，不碰数据。
 */

import type { Doc } from '../../core/types.js';
import { clientToLocal } from '../../editor/geometry.js';
import { groupComments } from './model.js';

const sameSet = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((id) => b.includes(id));

function blockOf(host: HTMLElement, id: string): HTMLElement | null {
  return host.querySelector<HTMLElement>(`.block[data-id="${id}"]`);
}

export function clearGroupMarks(host: HTMLElement): void {
  host.querySelectorAll('.has-group-comment, .editing-group-comment').forEach((el) => {
    el.classList.remove('has-group-comment', 'editing-group-comment');
  });
}

export function applyGroupMarks(host: HTMLElement, doc: Doc, editingGroupIds: readonly string[] = []): void {
  clearGroupMarks(host);
  let editingCommitted = false;
  for (const note of groupComments(doc)) {
    const ids = note.anchor.blockIds ?? [];
    for (const id of ids) blockOf(host, id)?.classList.add('has-group-comment');
    if (editingGroupIds.length && sameSet(editingGroupIds, ids)) {
      editingCommitted = true;
      for (const id of ids) blockOf(host, id)?.classList.add('editing-group-comment');
    }
  }
  if (editingGroupIds.length >= 2 && !editingCommitted) {
    for (const id of editingGroupIds) blockOf(host, id)?.classList.add('editing-group-comment');
  }
}

export function clearGroupOverlay(host: HTMLElement): void {
  host.querySelectorAll(':scope > .group-comment-line').forEach((line) => line.remove());
  clearGroupMarks(host);
}

function createLine(editing: boolean, color: string): HTMLElement {
  const line = document.createElement('div');
  line.className = 'group-comment-line';
  line.style.setProperty('--group-line-color', color);
  if (editing) line.classList.add('is-editing');
  return line;
}

function positionLine(line: HTMLElement, host: HTMLElement, blocks: readonly HTMLElement[]): void {
  if (blocks.length < 2) {
    line.remove();
    return;
  }
  const rects = blocks.map((el) => el.getBoundingClientRect());
  const top = clientToLocal(host, 0, Math.min(...rects.map((rect) => rect.top))).y;
  const bottom = clientToLocal(host, 0, Math.max(...rects.map((rect) => rect.bottom))).y;
  const right = clientToLocal(host, Math.max(...rects.map((rect) => rect.right)), 0).x;
  line.style.top = `${top}px`;
  line.style.height = `${Math.max(0, bottom - top)}px`;
  line.style.left = `${right + 2}px`;
}

/** 重画所有组注释范围线；返回本次创建的线节点。 */
export function paintGroupOverlay(host: HTMLElement, doc: Doc, editingGroupIds: readonly string[] = [], editingColor?: string): HTMLElement[] {
  host.querySelectorAll(':scope > .group-comment-line').forEach((line) => line.remove());
  const lines: HTMLElement[] = [];
  let editingCommitted = false;
  for (const note of groupComments(doc)) {
    const ids = note.anchor.blockIds ?? [];
    const blocks = ids.map((id) => blockOf(host, id)).filter((el): el is HTMLElement => Boolean(el));
    if (blocks.length < 2) continue;
    const editing = editingGroupIds.length > 0 && sameSet(editingGroupIds, ids);
    if (editing) editingCommitted = true;
    const line = createLine(editing, note.color || '#8aa4ff');
    host.appendChild(line);
    positionLine(line, host, blocks);
    lines.push(line);
  }
  if (editingGroupIds.length >= 2 && !editingCommitted) {
    const blocks = editingGroupIds.map((id) => blockOf(host, id)).filter((el): el is HTMLElement => Boolean(el));
    if (blocks.length >= 2) {
      const line = createLine(true, editingColor || '#8aa4ff');
      host.appendChild(line);
      positionLine(line, host, blocks);
      lines.push(line);
    }
  }
  return lines;
}
