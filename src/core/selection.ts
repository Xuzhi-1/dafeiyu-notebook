/**
 * 选区模型：唯一事实来源。
 * DOM 里的选中态只是它的投影；重渲染后按模型恢复（行为规格 R3）。
 */

import type { Doc } from './types.js';

export interface Selection {
  /** 选中的块（多选/框选）；单个块时长度为 1 */
  readonly blockIds: readonly string[];
  /** 光标所在块 */
  readonly activeId: string | null;
}

export const emptySelection: Selection = { blockIds: [], activeId: null };

export function selectOne(id: string): Selection {
  return { blockIds: [id], activeId: id };
}

export function selectMany(ids: readonly string[], activeId: string | null = null): Selection {
  const unique = [...new Set(ids)];
  return { blockIds: unique, activeId: activeId ?? unique[unique.length - 1] ?? null };
}

/** 丢掉文档里已不存在的块，避免选区指向幽灵块 */
export function normalizeSelection(selection: Selection, doc: Doc): Selection {
  const exists = new Set(doc.blocks.map((block) => block.id));
  const blockIds = selection.blockIds.filter((id) => exists.has(id));
  const activeId = selection.activeId && exists.has(selection.activeId) ? selection.activeId : blockIds[blockIds.length - 1] ?? null;
  if (blockIds.length === selection.blockIds.length && activeId === selection.activeId) return selection;
  return { blockIds, activeId };
}

export function sameSelection(a: Selection, b: Selection): boolean {
  return a.activeId === b.activeId
    && a.blockIds.length === b.blockIds.length
    && a.blockIds.every((id, index) => id === b.blockIds[index]);
}
