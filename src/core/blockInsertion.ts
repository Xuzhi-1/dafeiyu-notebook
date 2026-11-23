/** 块插入计划：生成操作，不修改 DOM、不处理焦点。 */

import type { Annotation, Block, Doc } from './types.js';
import { uid } from './types.js';
import { cloneAnnotations } from './notes.js';
import { plainText } from './toc.js';
import { applyOps, type Op } from './ops.js';

export interface BlockInsertionPlan {
  readonly ops: readonly Op[];
  readonly selection: readonly string[];
  readonly anchorId: string;
}

export interface BlockInsertionOptions {
  /** 插件插入保留它创建块时的 ID；复制/粘贴默认生成新 ID。 */
  readonly preserveIds?: boolean;
}

export function createBlockInsertionPlan(
  doc: Doc,
  selectedIds: readonly string[],
  sourceBlocks: readonly Block[],
  sourceAnnotations: readonly Annotation[],
  options: BlockInsertionOptions = {},
): BlockInsertionPlan | null {
  if (!sourceBlocks.length) return null;
  const selected = new Set(selectedIds);
  const targets = doc.blocks.filter((block) => selected.has(block.id));
  const target = targets[targets.length - 1];
  if (!target) return null;
  const targetIndex = doc.blocks.findIndex((block) => block.id === target.id);
  if (targetIndex < 0) return null;

  const targetHasNotes = doc.annotations.some((annotation) => (
    annotation.anchor.blockId === target.id || annotation.anchor.blockIds?.includes(target.id)
  )) || doc.groups.some((group) => group.blockIds.includes(target.id));
  const replace = targets.length === 1
    && target.type === 'paragraph'
    && plainText(target.html) === ''
    && !targetHasNotes;

  const idMap = new Map<string, string>();
  const copies = sourceBlocks.map((block) => {
    const id = options.preserveIds ? block.id : uid('b');
    idMap.set(block.id, id);
    return { ...block, id };
  });
  const cloned = cloneAnnotations(sourceAnnotations, idMap);
  const at = replace ? targetIndex : targetIndex + 1;
  const insertOps: Op[] = [];
  if (replace) insertOps.push({ t: 'removeBlocks', ids: [target.id] });
  insertOps.push({ t: 'insertBlocks', at, blocks: copies });
  const afterInsert = applyOps(doc, insertOps);
  const ops = [...insertOps];
  if (cloned.length) {
    ops.push({ t: 'patchDoc', patch: { annotations: [...afterInsert.annotations, ...cloned] } });
  }
  return {
    ops,
    selection: copies.map((block) => block.id),
    anchorId: replace ? copies[0].id : target.id,
  };
}
