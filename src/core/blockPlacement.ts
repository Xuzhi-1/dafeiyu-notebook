/** 块插入位置：表格与插件插入共用同一套选区规则。 */

import type { Block, Doc } from './types.js';
import { plainText } from './toc.js';

export interface BlockPlacement {
  readonly target: Block;
  readonly index: number;
  readonly replace: boolean;
}

/**
 * 以文档顺序的最后一个选中块为锚点。
 * 只有单选空段落时原地替换，其余情况都插到锚点后面。
 */
export function resolveBlockPlacement(doc: Doc, selectedIds: readonly string[]): BlockPlacement | null {
  const selected = new Set(selectedIds);
  const targets = doc.blocks.filter((block) => selected.has(block.id));
  const target = targets[targets.length - 1];
  if (!target) return null;
  return {
    target,
    index: doc.blocks.findIndex((block) => block.id === target.id) + 1,
    replace: targets.length === 1 && target.type === 'paragraph' && plainText(target.html) === '',
  };
}
