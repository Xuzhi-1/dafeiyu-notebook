/** 组注释重整的共享结构与排序工具。 */

import type { Annotation, CommentAnnotation } from '../types.js';

export interface GroupInfo {
  ids: string[];
  notes: CommentAnnotation[];
}

export const keyOf = (ids: readonly string[], order: ReadonlyMap<string, number>): string =>
  [...ids].sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0)).join('|');

export const sortByOrder = (ids: readonly string[], order: ReadonlyMap<string, number>): string[] =>
  [...new Set(ids)].sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0));

export function collectGroups(
  annotations: readonly Annotation[],
  order: ReadonlyMap<string, number>,
): GroupInfo[] {
  const map = new Map<string, GroupInfo>();
  for (const annotation of annotations) {
    if (annotation.type !== 'comment' || !annotation.anchor.blockIds?.length) continue;
    const ids = sortByOrder(annotation.anchor.blockIds.filter((id) => order.has(id)), order);
    if (ids.length < 2) continue;
    const key = keyOf(ids, order);
    const group = map.get(key);
    if (group) group.notes.push(annotation);
    else map.set(key, { ids, notes: [annotation] });
  }
  return [...map.values()];
}

export function containsGroup(target: GroupInfo, source: GroupInfo, order: ReadonlyMap<string, number>): boolean {
  const targetPositions = target.ids.map((id) => order.get(id)!);
  const sourcePositions = source.ids.map((id) => order.get(id)!);
  return Math.min(...sourcePositions) >= Math.min(...targetPositions)
    && Math.max(...sourcePositions) <= Math.max(...targetPositions);
}

export function updateGroupAnchors(
  annotations: Annotation[],
  notes: readonly CommentAnnotation[],
  ids: readonly string[],
  order: ReadonlyMap<string, number>,
): CommentAnnotation[] {
  const sorted = sortByOrder(ids, order);
  const updated = new Map(notes.map((note) => [
    note.id,
    { ...note, anchor: { blockId: sorted[0], blockIds: sorted } },
  ]));
  for (let index = 0; index < annotations.length; index += 1) {
    const next = updated.get(annotations[index].id);
    if (next) annotations[index] = next;
  }
  return notes.map((note) => updated.get(note.id)!);
}
