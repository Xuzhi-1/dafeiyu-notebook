/** 组注释范围重整入口：按阶段处理，UI 不参与。 */

import type { Block, Doc } from '../types.js';
import { absorbMovedBlocks } from './absorb.js';
import { mergeContainedGroup } from './merge.js';
import { pruneMovedMembers } from './prune.js';

export function reconcileGroupCommentsAfterMove(
  doc: Doc,
  movingIds: readonly string[],
  nextBlocks: readonly Block[],
): Doc['annotations'] {
  if (!doc.annotations.length || !movingIds.length) return doc.annotations;
  const moving = new Set(movingIds);
  const order = new Map(nextBlocks.map((block, index) => [block.id, index]));

  const pruned = pruneMovedMembers(doc, moving, order);
  const annotations = pruned.annotations;
  let changed = pruned.changed;

  if (mergeContainedGroup(annotations, moving, order)) changed = true;
  if (absorbMovedBlocks(annotations, movingIds, moving, order)) changed = true;

  return changed ? annotations : doc.annotations;
}

/** 插入块落在组注释范围内时，自动加入该组。 */
export function reconcileGroupCommentsAfterInsert(
  doc: Doc,
  insertedIds: readonly string[],
  nextBlocks: readonly Block[],
): Doc['annotations'] {
  if (!doc.annotations.length || !insertedIds.length) return doc.annotations;
  const order = new Map(nextBlocks.map((block, index) => [block.id, index]));
  const annotations = [...doc.annotations];
  const changed = absorbMovedBlocks(annotations, insertedIds, new Set(insertedIds), order);
  return changed ? annotations : doc.annotations;
}
