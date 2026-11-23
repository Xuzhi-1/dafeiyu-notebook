/**
 * 标记 / 注释（独立 annotations 集合）。
 *
 * 标记与注释是文档里的独立对象，通过 anchor.blockId 锚定到块；
 * 组注释在 anchor.blockIds 里记录成员。所有修改都编译成 patchDoc。
 */

import type {
  Annotation, Block, CommentAnnotation, Doc, Mark, MarkAnnotation,
} from './types.js';
import { uid } from './types.js';
import type { Op } from './ops.js';

export function commentsOf(doc: Doc, blockId: string): readonly CommentAnnotation[] {
  return doc.annotations.filter(
    (annotation): annotation is CommentAnnotation => annotation.type === 'comment' && annotation.anchor.blockId === blockId,
  );
}

export function commentCount(doc: Doc, blockId: string): number {
  return commentsOf(doc, blockId).length;
}

interface MarkIndex {
  direct: Map<string, Mark>;
  groups: Map<string, MarkAnnotation>;
}

const markIndexCache = new WeakMap<Doc['annotations'], MarkIndex>();

function markIndex(doc: Doc): MarkIndex {
  const cached = markIndexCache.get(doc.annotations);
  if (cached) return cached;
  const direct = new Map<string, Mark>();
  const groups = new Map<string, MarkAnnotation>();
  for (const annotation of doc.annotations) {
    if (annotation.type !== 'mark') continue;
    if (!annotation.anchor.blockIds?.length) {
      direct.set(annotation.anchor.blockId, annotation.mark);
      continue;
    }
    for (const id of annotation.anchor.blockIds) groups.set(id, annotation);
  }
  const index = { direct, groups };
  markIndexCache.set(doc.annotations, index);
  return index;
}

export function markForBlock(doc: Doc, blockId: string): Mark | undefined {
  const index = markIndex(doc);
  return index.direct.get(blockId) ?? index.groups.get(blockId)?.mark;
}

export interface BlockMarkInfo {
  badge?: Mark;
  group?: Mark;
  groupHead: boolean;
  groupTail: boolean;
  groupKey?: string;
}

/** 一次查找得到块标记、组标记范围与组头/组尾信息。 */
export function markInfoForBlock(doc: Doc, blockId: string): BlockMarkInfo {
  const index = markIndex(doc);
  const direct = index.direct.get(blockId);
  const group = index.groups.get(blockId);
  const ids = group?.anchor.blockIds;
  const groupHead = ids?.[0] === blockId;
  const groupTail = ids?.[ids.length - 1] === blockId;
  return {
    badge: direct ?? (groupHead ? group?.mark : undefined),
    group: group?.mark,
    groupHead,
    groupTail,
    groupKey: group?.id,
  };
}

/** 覆盖这些块的所有标记（含组标记）。 */
export function marksForBlocks(doc: Doc, blockIds: readonly string[]): MarkAnnotation[] {
  const ids = new Set(blockIds);
  return doc.annotations.filter(
    (item): item is MarkAnnotation =>
      item.type === 'mark'
        && (ids.has(item.anchor.blockId) || Boolean(item.anchor.blockIds?.some((id) => ids.has(id)))),
  );
}

export function defaultMark(kind: Mark['kind'] = 'mark'): Mark {
  return { kind, icon: 'star', color: '#ED7D31', label: kind === 'mark' ? '标记' : '重点', shape: 'circle' };
}

function colorComments(
  doc: Doc,
  color: string,
  matches: (annotation: CommentAnnotation) => boolean,
): Op[] | null {
  let changed = false;
  const annotations = doc.annotations.map((annotation): Annotation => {
    if (annotation.type !== 'comment' || !matches(annotation) || annotation.color === color) return annotation;
    changed = true;
    return { ...annotation, color };
  });
  return changed ? [{ t: 'patchDoc', patch: { annotations } }] : null;
}

/** 修改目标区块上已有注释的颜色。 */
export function setCommentColorOp(doc: Doc, blockIds: readonly string[], color: string): Op[] | null {
  const ids = new Set(blockIds);
  if (!ids.size) return null;
  return colorComments(doc, color, (annotation) => (
    ids.has(annotation.anchor.blockId)
    || Boolean(annotation.anchor.blockIds?.some((id) => ids.has(id)))
  ));
}

/** 按注释 ID 修改颜色，用于直接选中注释行的场景。 */
export function setCommentColorByIdsOp(doc: Doc, noteIds: readonly string[], color: string): Op[] | null {
  const ids = new Set(noteIds);
  if (!ids.size) return null;
  return colorComments(doc, color, (annotation) => ids.has(annotation.id));
}

/** 组注释必须覆盖文档中连续的一段区块。 */
export function isContiguousGroup(doc: Doc, blockIds: readonly string[]): boolean {
  const order = new Map(doc.blocks.map((block, index) => [block.id, index]));
  const positions = [...new Set(blockIds)]
    .map((id) => order.get(id))
    .filter((index): index is number => index !== undefined)
    .sort((a, b) => a - b);
  if (positions.length < 2 || positions.length !== new Set(blockIds).size) return false;
  return positions.every((position, index) => index === 0 || position === positions[index - 1] + 1);
}

/** 新区块组是否和已有组注释范围冲突；完全相同的组允许继续追加评论。 */
export function groupRangeConflicts(doc: Doc, groupIds: readonly string[]): boolean {
  const selected = new Set(groupIds);
  return doc.annotations.some((annotation) => {
    if (annotation.type !== 'comment' || !annotation.anchor.blockIds?.length) return false;
    const ids = annotation.anchor.blockIds;
    if (!ids.some((id) => selected.has(id))) return false;
    const exact = ids.length === groupIds.length && ids.every((id) => selected.has(id));
    return !exact;
  });
}

/** 按文档顺序排列组注释成员。 */
export function sortGroupIds(doc: Doc, blockIds: readonly string[]): string[] {
  const order = new Map(doc.blocks.map((block, index) => [block.id, index]));
  return [...new Set(blockIds)].sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0));
}

export function addNoteOp(
  doc: Doc,
  blockId: string,
  html: string,
  groupIds: readonly string[] = [],
  images: readonly string[] = [],
  appearance: { color?: string; avatar?: string; format?: 'html' } = {},
): Op[] | null {
  const text = html.trim();
  const block = doc.blocks.find((item) => item.id === blockId);
  if (!block || (!text && !images.length)) return null;
  if (groupIds.length > 1 && (!isContiguousGroup(doc, groupIds) || groupRangeConflicts(doc, groupIds))) {
    return null;
  }
  const orderedGroups = groupIds.length > 1 ? sortGroupIds(doc, groupIds) : [];
  const anchor = orderedGroups.length
    ? { blockId: orderedGroups[0], blockIds: orderedGroups }
    : { blockId };
  const annotation: CommentAnnotation = {
    id: uid('n'),
    type: 'comment',
    anchor,
    html: text,
    createdAt: Date.now(),
    ...(images.length ? { images: [...images] } : {}),
    ...(appearance.color ? { color: appearance.color } : {}),
    ...(appearance.avatar ? { avatar: appearance.avatar } : {}),
    ...(appearance.format ? { format: appearance.format } : {}),
  };
  return [{ t: 'patchDoc', patch: { annotations: [...doc.annotations, annotation] } }];
}

export function setCommentImageWidthOp(doc: Doc, noteId: string, index: number, width: number): Op[] | null {
  const current = doc.annotations.find((annotation) => annotation.type === 'comment' && annotation.id === noteId);
  if (!current || current.type !== 'comment' || !current.images?.[index]) return null;
  const nextWidth = Math.min(100, Math.max(10, Math.round(width)));
  const widths = [...(current.imageWidths ?? [])];
  while (widths.length < current.images.length) widths.push(100);
  if (widths[index] === nextWidth) return null;
  widths[index] = nextWidth;
  const updated = { ...current, imageWidths: widths };
  return [{ t: 'patchDoc', patch: { annotations: doc.annotations.map((item) => item.id === noteId ? updated : item) } }];
}

export function updateCommentImageOp(
  doc: Doc,
  noteId: string,
  index: number,
  patch: { src?: string; width?: number; align?: 'left' | 'center' | 'right' },
): Op[] | null {
  const current = doc.annotations.find((annotation) => annotation.type === 'comment' && annotation.id === noteId);
  if (!current || current.type !== 'comment' || !current.images?.[index]) return null;
  const images = [...current.images];
  const widths = [...(current.imageWidths ?? [])];
  const aligns = [...(current.imageAligns ?? [])];
  while (widths.length < images.length) widths.push(100);
  while (aligns.length < images.length) aligns.push('left');
  if (patch.src !== undefined) images[index] = patch.src;
  if (patch.width !== undefined) widths[index] = Math.min(100, Math.max(10, Math.round(patch.width)));
  if (patch.align !== undefined) aligns[index] = patch.align;
  if (images[index] === current.images[index]
    && widths[index] === (current.imageWidths?.[index] ?? 100)
    && aligns[index] === (current.imageAligns?.[index] ?? 'left')) return null;
  const updated = { ...current, images, imageWidths: widths, imageAligns: aligns };
  return [{ t: 'patchDoc', patch: { annotations: doc.annotations.map((item) => item.id === noteId ? updated : item) } }];
}

export function removeCommentImageOp(doc: Doc, noteId: string, index: number): Op[] | null {
  const current = doc.annotations.find((annotation) => annotation.type === 'comment' && annotation.id === noteId);
  if (!current || current.type !== 'comment' || !current.images?.[index]) return null;
  const images = current.images.filter((_, position) => position !== index);
  if (!images.length && !current.html.trim()) {
    return [{ t: 'patchDoc', patch: { annotations: doc.annotations.filter((item) => item.id !== noteId) } }];
  }
  const widths = [...(current.imageWidths ?? [])].filter((_, position) => position !== index);
  const aligns = [...(current.imageAligns ?? [])].filter((_, position) => position !== index);
  const updated = {
    ...current,
    images,
    imageWidths: widths.length ? widths : undefined,
    imageAligns: aligns.length ? aligns : undefined,
  };
  return [{ t: 'patchDoc', patch: { annotations: doc.annotations.map((item) => item.id === noteId ? updated : item) } }];
}

export function removeNotesOp(doc: Doc, noteIds: readonly string[]): Op[] | null {
  const ids = new Set(noteIds);
  if (!ids.size) return null;
  const next = doc.annotations.filter((annotation) => !ids.has(annotation.id));
  if (next.length === doc.annotations.length) return null;
  return [{ t: 'patchDoc', patch: { annotations: next } }];
}

export function removeNoteOp(doc: Doc, noteId: string): Op[] | null {
  return removeNotesOp(doc, [noteId]);
}

export function updateNoteOp(
  doc: Doc,
  noteId: string,
  html: string,
  appearance: { color?: string; avatar?: string; format?: 'html' } = {},
): Op[] | null {
  const current = doc.annotations.find((annotation) => annotation.type === 'comment' && annotation.id === noteId);
  if (!current || current.type !== 'comment') return null;
  const text = html.trim();
  const updated = {
    ...current,
    html: text,
    ...(appearance.color ? { color: appearance.color } : {}),
    ...(appearance.avatar ? { avatar: appearance.avatar } : {}),
    ...(appearance.format ? { format: appearance.format } : {}),
  };
  // 编辑只替换内容，保持注释在列表中的位置。
  const next = doc.annotations.map((annotation) => annotation.id === noteId ? updated : annotation);
  return [{ t: 'patchDoc', patch: { annotations: next } }];
}

/** 拖动排序：把 noteId 移到 targetId 前/后，只改数组顺序。 */
export function moveNoteOp(doc: Doc, noteId: string, targetId: string, after = false): Op[] | null {
  if (noteId === targetId) return null;
  const from = doc.annotations.findIndex((annotation) => annotation.type === 'comment' && annotation.id === noteId);
  const target = doc.annotations.find((annotation) => annotation.type === 'comment' && annotation.id === targetId);
  if (from < 0 || !target) return null;
  const next = [...doc.annotations];
  const [moved] = next.splice(from, 1);
  const targetIndex = next.findIndex((annotation) => annotation.id === targetId);
  if (targetIndex < 0) return null;
  next.splice(targetIndex + (after ? 1 : 0), 0, moved);
  return [{ t: 'patchDoc', patch: { annotations: next } }];
}

function groupMarkForSelection(doc: Doc, ids: ReadonlySet<string>): MarkAnnotation | undefined {
  return doc.annotations.find(
    (annotation): annotation is MarkAnnotation => annotation.type === 'mark'
      && Boolean(annotation.anchor.blockIds?.length)
      && [...ids].every((id) => annotation.anchor.blockIds!.includes(id)),
  );
}

function replaceGroupMark(doc: Doc, group: MarkAnnotation, mark: Mark): Op[] {
  return [{
    t: 'patchDoc',
    patch: {
      annotations: doc.annotations.map((annotation) => (
        annotation === group ? { ...annotation, mark } : annotation
      )),
    },
  }];
}

function withoutMarksFor(doc: Doc, ids: ReadonlySet<string>): Annotation[] {
  return doc.annotations.filter(
    (annotation) => !(annotation.type === 'mark' && (
      ids.has(annotation.anchor.blockId)
      || Boolean(annotation.anchor.blockIds?.some((id) => ids.has(id)))
    )),
  );
}

function markForSelection(doc: Doc, ids: ReadonlySet<string>, mark: Mark): MarkAnnotation {
  if (ids.size > 1) {
    const ordered = sortGroupIds(doc, [...ids]);
    return {
      id: uid('m'),
      type: 'mark',
      anchor: { blockId: ordered[0], blockIds: ordered },
      mark,
    };
  }
  const [id] = ids;
  return { id: uid('m'), type: 'mark', anchor: { blockId: id }, mark };
}

export function setMarkOp(doc: Doc, blockIds: readonly string[], mark: Mark | null): Op[] | null {
  const ids = new Set(blockIds.filter((id) => doc.blocks.some((block) => block.id === id)));
  if (!ids.size) return null;
  if (mark && ids.size > 1 && !isContiguousGroup(doc, [...ids])) return null;

  if (mark) {
    const group = groupMarkForSelection(doc, ids);
    if (group) return replaceGroupMark(doc, group, mark);
  }

  const next: Annotation[] = withoutMarksFor(doc, ids);
  if (mark) next.push(markForSelection(doc, ids, mark));
  if (next.length === doc.annotations.length && next.every((item, index) => item === doc.annotations[index])) return null;
  return [{ t: 'patchDoc', patch: { annotations: next } }];
}

/** 组注释：锚到第一块，成员列表放在 anchor.blockIds。 */
/** 清空块内容时，同步删除被完整覆盖的注释/标记。 */
export function annotationsAfterClearingBlocks(
  doc: Doc,
  blockIds: readonly string[],
): Annotation[] | null {
  const ids = new Set(blockIds);
  if (!ids.size) return null;
  const annotations = doc.annotations.filter((annotation) => (
    annotation.anchor.blockIds?.length
      ? !annotation.anchor.blockIds.every((id) => ids.has(id))
      : !ids.has(annotation.anchor.blockId)
  ));
  return annotations.length === doc.annotations.length ? null : annotations;
}

export function addGroupNoteOp(doc: Doc, blockIds: readonly string[], html: string): Op[] | null {
  const ids = blockIds.filter((id) => doc.blocks.some((block) => block.id === id));
  if (ids.length < 2) return null;
  return addNoteOp(doc, ids[0], html, ids);
}

/** 复制块时，把锚在这些块上的标记/注释一起取出来。 */
export function annotationsForBlocks(doc: Doc, blockIds: readonly string[]): readonly Annotation[] {
  const ids = new Set(blockIds);
  return doc.annotations.filter((annotation) => {
    if (!ids.has(annotation.anchor.blockId)) return false;
    const members = annotation.anchor.blockIds;
    return !members?.length || members.every((id) => ids.has(id));
  });
}

/** 复制块时重写锚点，返回新 annotations（不修改入参）。 */
export function cloneAnnotations(
  annotations: readonly Annotation[],
  idMap: ReadonlyMap<string, string>,
): Annotation[] {
  const copies: Annotation[] = [];
  for (const annotation of annotations) {
    const blockId = idMap.get(annotation.anchor.blockId);
    if (!blockId) continue;
    const blockIds = annotation.anchor.blockIds
      ?.map((id) => idMap.get(id))
      .filter((id): id is string => Boolean(id));
    const anchor = blockIds?.length ? { blockId, blockIds } : { blockId };
    if (annotation.type === 'mark') {
      copies.push({ ...annotation, id: uid('m'), anchor });
    } else {
      copies.push({ ...annotation, id: uid('n'), anchor });
    }
  }
  return copies;
}

export type { Block };
