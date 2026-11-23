/**
 * 文档差异：渲染器与撤销栈共用同一套 diff。
 *
 * - 渲染：只更新 changed 里的块，并按 afterOrder 调整顺序；
 * - 撤销：历史里保存 before/after 两个文档引用（块对象共享，只有数组是新的），
 *   直接切回去即可，不需要为每个功能手写反向操作。
 */

import type { Block, Doc } from './types.js';

export interface BlockChange {
  readonly id: string;
  /** null 表示新增 */
  readonly before: Block | null;
  /** null 表示删除 */
  readonly after: Block | null;
}

export interface DocDiff {
  readonly changed: readonly BlockChange[];
  readonly beforeOrder: readonly string[];
  readonly afterOrder: readonly string[];
  readonly orderChanged: boolean;
  readonly metaChanged: boolean;
  readonly empty: boolean;
}

export function diffDocs(before: Doc, after: Doc): DocDiff {
  if (before === after) {
    return { changed: [], beforeOrder: [], afterOrder: [], orderChanged: false, metaChanged: false, empty: true };
  }
  const beforeMap = new Map(before.blocks.map((block) => [block.id, block]));
  const afterMap = new Map(after.blocks.map((block) => [block.id, block]));

  const changed: BlockChange[] = [];
  for (const [id, block] of afterMap) {
    const previous = beforeMap.get(id);
    if (previous !== block) changed.push({ id, before: previous ?? null, after: block });
  }
  for (const [id, block] of beforeMap) {
    if (!afterMap.has(id)) changed.push({ id, before: block, after: null });
  }

  const beforeOrder = before.blocks.map((block) => block.id);
  const afterOrder = after.blocks.map((block) => block.id);
  const orderChanged = beforeOrder.length !== afterOrder.length
    || beforeOrder.some((id, index) => id !== afterOrder[index]);

  const metaChanged = before.title !== after.title
    || before.groups !== after.groups
    || before.toc !== after.toc
    || before.annotations !== after.annotations;

  return { changed, beforeOrder, afterOrder, orderChanged, metaChanged, empty: false };
}

/** 从 diff 里取出受影响块的 id（渲染器用来决定更新哪些节点） */
export function changedIds(diff: DocDiff): string[] {
  return diff.changed.map((item) => item.id);
}
