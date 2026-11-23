/** 第一阶段：移动出范围的成员退出，单成员降级为块注释。 */

import type { Annotation, CommentAnnotation, Doc } from '../types.js';
import { sortByOrder } from './shared.js';

const sameOrder = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((id, index) => id === b[index]);

export interface PruneResult {
  annotations: Annotation[];
  changed: boolean;
}

export function pruneMovedMembers(
  doc: Doc,
  moving: ReadonlySet<string>,
  order: ReadonlyMap<string, number>,
): PruneResult {
  const kept: Annotation[] = [];
  const converted: CommentAnnotation[] = [];
  let changed = false;

  for (const annotation of doc.annotations) {
    if (annotation.type !== 'comment' || !annotation.anchor.blockIds?.length) {
      kept.push(annotation);
      continue;
    }
    const members = annotation.anchor.blockIds;
    if (!members.some((id) => moving.has(id))) {
      kept.push(annotation);
      continue;
    }

    const unmoved = members.filter((id) => !moving.has(id) && order.has(id));
    // 整组一起移动，留给吞并阶段处理。
    if (!unmoved.length) {
      kept.push(annotation);
      continue;
    }

    let lo = Infinity;
    let hi = -1;
    for (const id of unmoved) {
      const position = order.get(id)!;
      if (position < lo) lo = position;
      if (position > hi) hi = position;
    }

    const remaining = members.filter((id) => {
      const position = order.get(id);
      if (position === undefined) return false;
      if (!moving.has(id)) return true;
      return position >= lo && position <= hi;
    });
    const sorted = sortByOrder(remaining.filter((id) => order.has(id)), order);

    if (sorted.length === 0) {
      changed = true;
      continue;
    }
    if (sorted.length === 1) {
      changed = true;
      converted.push({ ...annotation, anchor: { blockId: sorted[0] } });
      continue;
    }
    if (sameOrder(members, sorted) && annotation.anchor.blockId === sorted[0]) {
      kept.push(annotation);
      continue;
    }
    changed = true;
    kept.push({
      ...annotation,
      anchor: { blockId: sorted[0], blockIds: sorted },
    });
  }

  return { annotations: changed ? [...kept, ...converted] : [...doc.annotations], changed };
}
