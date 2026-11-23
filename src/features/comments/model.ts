/**
 * 注释查询：区分「块注释」和「组注释」，并决定显示位置。
 * 组注释锚在组首块，但显示在组尾块下方。
 *
 * annotations 数组是不可变的，按数组缓存索引；文档一变就是新数组，旧缓存可回收。
 */

import type { CommentAnnotation, Doc } from '../../core/types.js';

type Annotations = Doc['annotations'];

const groupCache = new WeakMap<Annotations, CommentAnnotation[]>();
const blockCache = new WeakMap<Annotations, Map<string, CommentAnnotation[]>>();
const displayCache = new WeakMap<Annotations, Map<string, CommentAnnotation[]>>();
const groupTailCache = new WeakMap<Annotations, Map<string, CommentAnnotation[]>>();
const groupBlockCache = new WeakMap<Annotations, Map<string, CommentAnnotation[]>>();

export function groupComments(doc: Doc): CommentAnnotation[] {
  const cached = groupCache.get(doc.annotations);
  if (cached) return cached;
  const groups = doc.annotations.filter(
    (item): item is CommentAnnotation => item.type === 'comment' && Boolean(item.anchor.blockIds?.length),
  );
  groupCache.set(doc.annotations, groups);
  return groups;
}

/** 以这个块为组尾块的组注释（组注释只显示在组尾块）。 */
export function groupCommentsAtTail(doc: Doc, blockId: string): CommentAnnotation[] {
  let cache = groupTailCache.get(doc.annotations);
  if (!cache) {
    cache = new Map();
    for (const item of groupComments(doc)) {
      const ids = item.anchor.blockIds ?? [];
      const tail = ids[ids.length - 1];
      if (!tail) continue;
      const list = cache.get(tail) ?? [];
      list.push(item);
      cache.set(tail, list);
    }
    groupTailCache.set(doc.annotations, cache);
  }
  return cache.get(blockId) ?? [];
}

function blockIndex(doc: Doc): Map<string, CommentAnnotation[]> {
  const cached = blockCache.get(doc.annotations);
  if (cached) return cached;
  const index = new Map<string, CommentAnnotation[]>();
  for (const item of doc.annotations) {
    if (item.type !== 'comment' || item.anchor.blockIds?.length) continue;
    const list = index.get(item.anchor.blockId) ?? [];
    list.push(item);
    index.set(item.anchor.blockId, list);
  }
  blockCache.set(doc.annotations, index);
  return index;
}

/** 只属于这个块的注释（不含组注释）。 */
export function blockComments(doc: Doc, blockId: string): CommentAnnotation[] {
  return blockIndex(doc).get(blockId) ?? [];
}

/** 一次遍历构建“每个块下方要显示的注释”索引，顺序与 annotations 一致。 */
export function commentDisplayIndex(doc: Doc): Map<string, CommentAnnotation[]> {
  const cached = displayCache.get(doc.annotations);
  if (cached) return cached;
  const index = new Map<string, CommentAnnotation[]>();
  for (const item of doc.annotations) {
    if (item.type !== 'comment') continue;
    const blockId = item.anchor.blockIds?.length
      ? item.anchor.blockIds[item.anchor.blockIds.length - 1]
      : item.anchor.blockId;
    if (!blockId) continue;
    const list = index.get(blockId) ?? [];
    list.push(item);
    index.set(blockId, list);
  }
  displayCache.set(doc.annotations, index);
  return index;
}

/** 显示在这个块下方的注释：块注释 + 以它为尾块的组注释。 */
export function displayComments(doc: Doc, blockId: string): CommentAnnotation[] {
  return commentDisplayIndex(doc).get(blockId) ?? [];
}

export function groupCommentForGroup(doc: Doc, groupIds: readonly string[]): CommentAnnotation | undefined {
  return groupComments(doc).find(
    (item) => item.anchor.blockIds?.length === groupIds.length
      && item.anchor.blockIds.every((id) => groupIds.includes(id)),
  );
}

/** 只要这个组里已有组注释，就禁止再新建组注释。 */
export function hasGroupComment(doc: Doc, groupIds: readonly string[]): boolean {
  return groupComments(doc).some(
    (item) => item.anchor.blockIds?.some((id) => groupIds.includes(id)),
  );
}

/** 覆盖这个块的所有组注释（不要求它属于 doc.groups）。 */
export function groupCommentsForBlock(doc: Doc, blockId: string): CommentAnnotation[] {
  let cache = groupBlockCache.get(doc.annotations);
  if (!cache) {
    cache = new Map();
    for (const item of groupComments(doc)) {
      for (const id of item.anchor.blockIds ?? []) {
        const list = cache.get(id) ?? [];
        list.push(item);
        cache.set(id, list);
      }
    }
    groupBlockCache.set(doc.annotations, cache);
  }
  return cache.get(blockId) ?? [];
}

export function groupTailId(blockIds: readonly string[]): string {
  return blockIds[blockIds.length - 1] ?? '';
}
