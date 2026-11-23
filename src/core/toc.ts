/**
 * 目录（手动大纲）操作：全部编译成 patchDoc 原语。
 *
 * 目录项按数组顺序渲染，父子关系由 parentId 决定；
 * 折叠状态存在目录项自身（随文档保存，行为规格 R22）。
 */

import type { Doc, TocEntry } from './types.js';
import { uid } from './types.js';

export type TocPosition = 'before' | 'after' | 'inside';

export interface TocDropTarget {
  readonly entryId: string;
  readonly position: TocPosition;
}

export function plainText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

export function labelForBlocks(doc: Doc, blockIds: readonly string[]): string {
  const first = doc.blocks.find((block) => block.id === blockIds[0]);
  const text = first ? plainText(first.html) : '';
  if (!text) return '未命名目录';
  // 单块目录不截断数据；多块目录只显示前 30 个字，方便侧栏排版
  return blockIds.length > 1 ? `${text.slice(0, 30)} 等${blockIds.length}项` : text;
}

export function findEntry(doc: Doc, id: string): TocEntry | undefined {
  return doc.toc.find((entry) => entry.id === id);
}

function parentOf(toc: readonly TocEntry[], id: string): string | null {
  return toc.find((entry) => entry.id === id)?.parentId ?? null;
}

export function isDescendant(toc: readonly TocEntry[], candidateId: string, ancestorId: string): boolean {
  let cursor = parentOf(toc, candidateId);
  let guard = 0;
  while (cursor && guard < 64) {
    if (cursor === ancestorId) return true;
    cursor = parentOf(toc, cursor);
    guard += 1;
  }
  return false;
}

function makeEntry(doc: Doc, ids: readonly string[], parentId: string | null): TocEntry {
  return {
    id: uid('toc'),
    blockId: ids[0],
    blockIds: ids.length > 1 ? [...ids] : [],
    label: labelForBlocks(doc, ids),
    parentId: parentId && doc.toc.some((item) => item.id === parentId) ? parentId : null,
    level: 0,
    collapsed: false,
  };
}

/** 追加到同级末尾（保留给“加入目录”按钮用） */
export function addEntry(doc: Doc, blockIds: readonly string[], parentId: string | null = null): TocEntry[] | null {
  const ids = blockIds.filter((id) => doc.blocks.some((block) => block.id === id));
  if (!ids.length) return null;
  const entry = makeEntry(doc, ids, parentId);
  const siblings = doc.toc.filter((item) => item.parentId === entry.parentId);
  const lastSibling = siblings[siblings.length - 1];
  const insertAt = lastSibling ? doc.toc.indexOf(lastSibling) + 1 : doc.toc.length;
  const next = [...doc.toc];
  next.splice(insertAt, 0, entry);
  return next;
}

/**
 * 按落点插入目录项（拖块到目录用）：
 * - before / after：插到目标项前/后，层级跟目标项同级；
 * - inside：成为目标项的子级，并把目标项自动展开；
 * - 没有目标：追加到顶层末尾。
 * 同一组块允许重复加入，每次生成新的目录项。
 */
export function addEntryAt(doc: Doc, blockIds: readonly string[], target: TocDropTarget | null): TocEntry[] | null {
  const ids = blockIds.filter((id) => doc.blocks.some((block) => block.id === id));
  if (!ids.length) return null;

  if (target) {
    const targetEntry = doc.toc.find((entry) => entry.id === target.entryId);
    if (targetEntry) {
      const next = target.position === 'inside'
        ? doc.toc.map((entry) => (entry.id === targetEntry.id ? { ...entry, collapsed: false } : entry))
        : [...doc.toc];
      const entry = makeEntry(doc, ids, target.position === 'inside' ? targetEntry.id : targetEntry.parentId);
      const index = next.findIndex((item) => item.id === targetEntry.id);
      if (index >= 0) {
        if (target.position === 'inside') {
          let cursor = index + 1;
          while (cursor < next.length && isWithin(next, next[cursor].id, targetEntry.id)) cursor += 1;
          next.splice(cursor, 0, entry);
        } else {
          next.splice(target.position === 'before' ? index : index + 1, 0, entry);
        }
        return next;
      }
    }
  }

  return [...doc.toc, makeEntry(doc, ids, null)];
}

export function removeEntry(doc: Doc, entryId: string): TocEntry[] | null {
  const entry = findEntry(doc, entryId);
  if (!entry) return null;
  return doc.toc
    .filter((item) => item.id !== entryId)
    .map((item) => (item.parentId === entryId ? { ...item, parentId: entry.parentId } : item));
}

/** 目录项自身 + 全部后代，用于“选中父项即选中子树”。 */
export function entrySubtreeIds(doc: Doc, entryId: string): string[] {
  const result: string[] = [];
  const walk = (id: string): void => {
    if (result.includes(id)) return;
    result.push(id);
    for (const entry of doc.toc) {
      if (entry.parentId === id) walk(entry.id);
    }
  };
  walk(entryId);
  return result;
}

/** 多选时只保留最外层目录项；子项跟随父项移动。 */
function rootEntryIds(doc: Doc, entryIds: readonly string[]): string[] {
  const selected = new Set(entryIds.filter((id) => doc.toc.some((entry) => entry.id === id)));
  return doc.toc
    .filter((entry) => selected.has(entry.id) && (!entry.parentId || !selected.has(entry.parentId)))
    .map((entry) => entry.id);
}

/** 批量删除：只删除选中的目录项；仍挂在不存在的父项上的条目向上寻找祖先。 */
export function removeEntries(doc: Doc, entryIds: readonly string[]): TocEntry[] | null {
  const drop = new Set(entryIds);
  if (![...drop].some((id) => doc.toc.some((entry) => entry.id === id))) return null;
  const byId = new Map(doc.toc.map((entry) => [entry.id, entry]));
  const next = doc.toc
    .filter((entry) => !drop.has(entry.id))
    .map((entry) => {
      let parentId = entry.parentId;
      let guard = 0;
      while (parentId && drop.has(parentId) && guard < 64) {
        parentId = byId.get(parentId)?.parentId ?? null;
        guard += 1;
      }
      return parentId === entry.parentId ? entry : { ...entry, parentId };
    });
  return next;
}

/** 删除块时同步清理所有引用这些块的目录项，并把子目录挂到最近的存活祖先。 */
export function tocWithoutBlocks(toc: readonly TocEntry[], blockIds: readonly string[]): TocEntry[] | null {
  const drop = new Set(blockIds);
  if (!drop.size) return null;
  const removed = new Set(toc
    .filter((entry) => drop.has(entry.blockId) || entry.blockIds.some((id) => drop.has(id)))
    .map((entry) => entry.id));
  if (!removed.size) return null;
  const byId = new Map(toc.map((entry) => [entry.id, entry]));
  return toc
    .filter((entry) => !removed.has(entry.id))
    .map((entry) => {
      let parentId = entry.parentId;
      let guard = 0;
      while (parentId && removed.has(parentId) && guard < 64) {
        parentId = byId.get(parentId)?.parentId ?? null;
        guard += 1;
      }
      return parentId === entry.parentId ? entry : { ...entry, parentId };
    });
}

/** 批量移动：只移动最外层选中项，目标不能位于被移动的子树内。 */
export function moveEntries(
  doc: Doc,
  entryIds: readonly string[],
  targetId: string,
  position: TocPosition,
): TocEntry[] | null {
  const target = findEntry(doc, targetId);
  const roots = rootEntryIds(doc, entryIds);
  if (!target || !roots.length) return null;
  if (roots.some((id) => id === targetId || isDescendant(doc.toc, targetId, id))) return null;

  const moving = new Set(roots);
  const rest = doc.toc.filter((entry) => !moving.has(entry.id));
  const targetIndex = rest.findIndex((entry) => entry.id === targetId);
  if (targetIndex < 0) return null;
  const parentId = position === 'inside' ? target.id : target.parentId;
  const moved = roots.map((id) => {
    const entry = doc.toc.find((item) => item.id === id)!;
    return { ...entry, parentId };
  });

  const next = [...rest];
  if (position === 'inside') {
    const targetEntry = next[targetIndex];
    next[targetIndex] = { ...targetEntry, collapsed: false };
    let cursor = targetIndex + 1;
    while (cursor < next.length && isWithin(next, next[cursor].id, target.id)) cursor += 1;
    next.splice(cursor, 0, ...moved);
  } else {
    next.splice(position === 'before' ? targetIndex : targetIndex + 1, 0, ...moved);
  }
  return next;
}

/** 批量拖到目录末尾：全部变为顶层项，保留相对顺序。 */
export function moveEntriesToEnd(doc: Doc, entryIds: readonly string[]): TocEntry[] | null {
  const roots = rootEntryIds(doc, entryIds);
  if (!roots.length) return null;
  const moving = new Set(roots);
  const rest = doc.toc.filter((entry) => !moving.has(entry.id));
  const moved = roots.map((id) => ({ ...doc.toc.find((entry) => entry.id === id)!, parentId: null }));
  return [...rest, ...moved];
}

export function renameEntry(doc: Doc, entryId: string, label: string): TocEntry[] | null {
  const text = label.trim();
  if (!text) return null;
  return doc.toc.map((entry) => (entry.id === entryId ? { ...entry, label: text } : entry));
}

export function toggleCollapse(doc: Doc, entryId: string): TocEntry[] | null {
  return doc.toc.map((entry) => (entry.id === entryId ? { ...entry, collapsed: !entry.collapsed } : entry));
}

export function moveEntry(doc: Doc, entryId: string, targetId: string, position: TocPosition): TocEntry[] | null {
  const entry = findEntry(doc, entryId);
  const target = findEntry(doc, targetId);
  if (!entry || !target || entryId === targetId) return null;
  // 目标在自己子树里：无论前/后/内部都非法
  if (isDescendant(doc.toc, targetId, entryId)) return null;

  const rest = doc.toc.filter((item) => item.id !== entryId);
  const targetIndex = rest.findIndex((item) => item.id === targetId);
  if (targetIndex < 0) return null;

  const moved: TocEntry = position === 'inside'
    ? { ...entry, parentId: target.id, collapsed: false }
    : { ...entry, parentId: target.parentId };

  const next = [...rest];
  if (position === 'inside') {
    let cursor = targetIndex + 1;
    while (cursor < next.length && isWithin(next, next[cursor].id, target.id)) cursor += 1;
    next.splice(cursor, 0, moved);
  } else {
    next.splice(position === 'before' ? targetIndex : targetIndex + 1, 0, moved);
  }
  return next;
}

/** 拖到目录末尾：成为最后一个顶层项（子项继续跟着它） */
export function moveEntryToEnd(doc: Doc, entryId: string): TocEntry[] | null {
  const entry = findEntry(doc, entryId);
  if (!entry) return null;
  const rest = doc.toc.filter((item) => item.id !== entryId);
  return [...rest, { ...entry, parentId: null }];
}

/** itemId 是否在 ancestorId 的子树里（只看 parentId 链，不依赖数组顺序） */
function isWithin(list: readonly TocEntry[], itemId: string, ancestorId: string): boolean {
  let cursor = parentOf(list, itemId);
  let guard = 0;
  while (cursor && guard < 64) {
    if (cursor === ancestorId) return true;
    cursor = parentOf(list, cursor);
    guard += 1;
  }
  return false;
}

/** 把“块 id 列表”转换成可直接 dispatch 的操作 */
export function tocOp(entries: readonly TocEntry[] | null): readonly { t: 'patchDoc'; patch: { toc: readonly TocEntry[] } }[] | null {
  if (!entries) return null;
  return [{ t: 'patchDoc', patch: { toc: [...entries] } }];
}
