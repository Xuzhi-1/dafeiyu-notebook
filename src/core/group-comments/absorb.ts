/** 第三阶段：本次移动的组外区块进入组范围后加入该组。 */

import type { Annotation, CommentAnnotation } from '../types.js';
import { keyOf, sortByOrder } from './shared.js';

interface RangeInfo {
  min: number;
  max: number;
}

export function absorbMovedBlocks(
  annotations: Annotation[],
  movingIds: readonly string[],
  moving: ReadonlySet<string>,
  order: ReadonlyMap<string, number>,
): boolean {
  const groupNotes = annotations.filter(
    (annotation): annotation is CommentAnnotation =>
      annotation.type === 'comment' && Boolean(annotation.anchor.blockIds?.length),
  );
  if (!groupNotes.length) return false;

  const grouped = new Set(groupNotes.flatMap((note) => note.anchor.blockIds ?? []));
  const ranges = new Map<string, RangeInfo>();
  for (const note of groupNotes) {
    const ids = (note.anchor.blockIds ?? []).filter((id) => order.has(id));
    if (ids.length < 2) continue;
    if (ids.every((id) => moving.has(id))) continue; // 整组移动不在这里吸收
    const positions = ids.map((id) => order.get(id)!);
    const key = keyOf(ids, order);
    const current = ranges.get(key);
    const min = Math.min(...positions);
    const max = Math.max(...positions);
    if (current) {
      current.min = Math.min(current.min, min);
      current.max = Math.max(current.max, max);
    } else {
      ranges.set(key, { min, max });
    }
  }
  if (!ranges.size) return false;

  const additions = new Map<string, Set<string>>();
  for (const id of movingIds) {
    const position = order.get(id);
    if (position === undefined || grouped.has(id)) continue;
    const target = [...ranges].find(([, range]) => position >= range.min && position <= range.max);
    if (!target) continue;
    const [key] = target;
    const list = additions.get(key) ?? new Set<string>();
    list.add(id);
    additions.set(key, list);
  }
  if (!additions.size) return false;

  for (let index = 0; index < annotations.length; index += 1) {
    const annotation = annotations[index];
    if (annotation.type !== 'comment' || !annotation.anchor.blockIds?.length) continue;
    const add = additions.get(keyOf(annotation.anchor.blockIds, order));
    if (!add) continue;
    const ids = sortByOrder([...annotation.anchor.blockIds, ...add], order);
    annotations[index] = {
      ...annotation,
      anchor: { blockId: ids[0], blockIds: ids },
    };
  }
  return true;
}
