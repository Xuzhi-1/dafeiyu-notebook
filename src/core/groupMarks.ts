/** 组标记成员重整：移动去留、整组吞并、组外块吸收。 */

import type { Annotation, Block, Doc, MarkAnnotation } from './types.js';

interface MarkRange {
  min: number;
  max: number;
}

interface MarkGroup {
  ids: string[];
  notes: MarkAnnotation[];
}

interface PruneResult {
  annotations: Doc['annotations'];
  changed: boolean;
}

const sortByOrder = (ids: readonly string[], order: ReadonlyMap<string, number>): string[] =>
  [...new Set(ids)].sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0));

const keyOf = (ids: readonly string[], order: ReadonlyMap<string, number>): string =>
  sortByOrder(ids, order).join('|');

function collectMarkGroups(
  annotations: readonly Annotation[],
  order: ReadonlyMap<string, number>,
): MarkGroup[] {
  const map = new Map<string, MarkGroup>();
  for (const annotation of annotations) {
    if (annotation.type !== 'mark' || !annotation.anchor.blockIds?.length) continue;
    const ids = sortByOrder(annotation.anchor.blockIds.filter((id) => order.has(id)), order);
    if (ids.length < 2) continue;
    const key = keyOf(ids, order);
    const group = map.get(key);
    if (group) group.notes.push(annotation);
    else map.set(key, { ids, notes: [annotation] });
  }
  return [...map.values()];
}

function contains(source: MarkGroup, target: MarkGroup, order: ReadonlyMap<string, number>): boolean {
  const sourcePositions = source.ids.map((id) => order.get(id)!);
  const targetPositions = target.ids.map((id) => order.get(id)!);
  return Math.min(...sourcePositions) >= Math.min(...targetPositions)
    && Math.max(...sourcePositions) <= Math.max(...targetPositions);
}

function pruneMovedMembers(
  doc: Doc,
  moving: ReadonlySet<string>,
  order: ReadonlyMap<string, number>,
): PruneResult {
  let changed = false;
  const annotations = doc.annotations.map((annotation): Annotation => {
    if (annotation.type !== 'mark' || !annotation.anchor.blockIds?.length) return annotation;
    const members = annotation.anchor.blockIds;
    if (!members.some((id) => moving.has(id))) return annotation;

    const stable = members.filter((id) => !moving.has(id) && order.has(id));
    let remaining: string[];
    if (!stable.length) {
      remaining = [...members];
    } else {
      let lo = Infinity;
      let hi = -1;
      for (const id of stable) {
        const position = order.get(id)!;
        if (position < lo) lo = position;
        if (position > hi) hi = position;
      }
      remaining = members.filter((id) => {
        const position = order.get(id);
        if (position === undefined) return false;
        if (!moving.has(id)) return true;
        return position >= lo && position <= hi;
      });
    }

    const sorted = sortByOrder(remaining, order);
    if (sorted.length === 1) {
      changed = true;
      return { ...annotation, anchor: { blockId: sorted[0] } };
    }
    if (
      sorted.length === members.length
      && sorted.every((id, index) => id === members[index])
      && annotation.anchor.blockId === sorted[0]
    ) {
      return annotation;
    }
    changed = true;
    return { ...annotation, anchor: { blockId: sorted[0], blockIds: sorted } };
  });
  return { annotations: changed ? annotations : doc.annotations, changed };
}

function mergeContainedMarks(
  annotations: readonly Annotation[],
  moving: ReadonlySet<string>,
  order: ReadonlyMap<string, number>,
  nextBlocks: readonly Block[],
): Annotation[] | null {
  const groups = collectMarkGroups(annotations, order);
  const stationary = groups.filter((group) => !group.ids.some((id) => moving.has(id)));
  const sources = groups.filter((group) => group.ids.every((id) => moving.has(id)));
  if (!stationary.length || !sources.length) return null;

  const byTarget = new Map<MarkGroup, MarkGroup[]>();
  for (const source of sources) {
    const candidates = stationary.filter((target) => contains(source, target, order));
    if (candidates.length !== 1) continue;
    const list = byTarget.get(candidates[0]) ?? [];
    list.push(source);
    byTarget.set(candidates[0], list);
  }
  if (!byTarget.size) return null;

  const targetAnchors = new Map<string, string[]>();
  const removedNotes = new Set<string>();
  const removeDirectMarks = new Set<string>();

  for (const [target, sourceGroups] of byTarget) {
    const union = sortByOrder([
      ...target.ids,
      ...sourceGroups.flatMap((group) => group.ids),
    ], order);
    const min = Math.min(...union.map((id) => order.get(id)!));
    const max = Math.max(...union.map((id) => order.get(id)!));
    const ids = nextBlocks.slice(min, max + 1).map((block) => block.id);
    for (const note of target.notes) targetAnchors.set(note.id, ids);
    for (const group of sourceGroups) {
      for (const note of group.notes) removedNotes.add(note.id);
      for (const id of group.ids) removeDirectMarks.add(id);
    }
    for (const id of ids) removeDirectMarks.add(id);
  }

  return annotations
    .filter((annotation) => !removedNotes.has(annotation.id))
    .filter((annotation) => !(
      annotation.type === 'mark'
      && !annotation.anchor.blockIds?.length
      && removeDirectMarks.has(annotation.anchor.blockId)
    ))
    .map((annotation) => {
      const ids = targetAnchors.get(annotation.id);
      if (!ids || annotation.type !== 'mark') return annotation;
      return { ...annotation, anchor: { blockId: ids[0], blockIds: ids } };
    });
}

function absorbMovedBlocks(
  annotations: readonly Annotation[],
  movingIds: readonly string[],
  order: ReadonlyMap<string, number>,
): Annotation[] | null {
  const groupNotes = annotations.filter(
    (item): item is MarkAnnotation => item.type === 'mark' && (item.anchor.blockIds?.length ?? 0) > 1,
  );
  if (!groupNotes.length) return null;

  const grouped = new Set(groupNotes.flatMap((item) => item.anchor.blockIds ?? []));
  const ranges = new Map<string, MarkRange>();
  for (const note of groupNotes) {
    const ids = (note.anchor.blockIds ?? []).filter((id) => order.has(id));
    if (ids.length < 2) continue;
    const positions = ids.map((id) => order.get(id)!);
    const key = keyOf(ids, order);
    const min = Math.min(...positions);
    const max = Math.max(...positions);
    const current = ranges.get(key);
    if (current) {
      current.min = Math.min(current.min, min);
      current.max = Math.max(current.max, max);
    } else {
      ranges.set(key, { min, max });
    }
  }

  const additions = new Map<string, Set<string>>();
  for (const id of movingIds) {
    const position = order.get(id);
    if (position === undefined || grouped.has(id)) continue;
    const target = [...ranges.entries()]
      .filter(([, range]) => position >= range.min && position <= range.max)
      .sort((a, b) => (a[1].max - a[1].min) - (b[1].max - b[1].min))[0];
    if (!target) continue;
    const list = additions.get(target[0]) ?? new Set<string>();
    list.add(id);
    additions.set(target[0], list);
  }
  if (!additions.size) return null;

  const addedIds = new Set([...additions.values()].flatMap((ids) => [...ids]));
  return annotations
    .filter((annotation) => !(
      annotation.type === 'mark'
      && !annotation.anchor.blockIds?.length
      && addedIds.has(annotation.anchor.blockId)
    ))
    .map((annotation) => {
      if (annotation.type !== 'mark' || !annotation.anchor.blockIds?.length) return annotation;
      const add = additions.get(keyOf(annotation.anchor.blockIds, order));
      if (!add) return annotation;
      const ids = sortByOrder([...annotation.anchor.blockIds, ...add], order);
      return { ...annotation, anchor: { blockId: ids[0], blockIds: ids } };
    });
}

export function reconcileGroupMarksAfterMove(
  doc: Doc,
  movingIds: readonly string[],
  nextBlocks: readonly Block[],
): Doc['annotations'] {
  if (!doc.annotations.length || !movingIds.length) return doc.annotations;
  const moving = new Set(movingIds);
  const order = new Map(nextBlocks.map((block, index) => [block.id, index]));

  const pruned = pruneMovedMembers(doc, moving, order);
  let annotations = pruned.annotations;
  let changed = pruned.changed;

  const merged = mergeContainedMarks(annotations, moving, order, nextBlocks);
  if (merged) {
    annotations = merged;
    changed = true;
  }
  const absorbed = absorbMovedBlocks(annotations, movingIds, order);
  if (absorbed) {
    annotations = absorbed;
    changed = true;
  }
  return changed ? annotations : doc.annotations;
}

/** 插入块落在组范围内时，自动加入该组，保持组连续。 */
export function reconcileGroupMarksAfterInsert(
  doc: Doc,
  insertedIds: readonly string[],
  nextBlocks: readonly Block[],
): Doc['annotations'] {
  if (!doc.annotations.length || !insertedIds.length) return doc.annotations;
  const order = new Map(nextBlocks.map((block, index) => [block.id, index]));
  return absorbMovedBlocks(doc.annotations, insertedIds, order) ?? doc.annotations;
}
