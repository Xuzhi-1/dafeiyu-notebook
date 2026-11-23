/**
 * 操作原语：整个软件只有这 5 种写操作。
 *
 * 任何功能（加注释、改颜色、目录折叠、插入表格、拖动排序……）都必须编译成
 * 这里的操作数组，再交给 store.dispatch 执行。核心不认识具体功能。
 *
 * 约定：
 * - 纯函数：不修改入参，返回新文档；没有变化时返回原引用。
 * - 下标 at 表示“数组下标”，插入/移动前会被夹到合法范围。
 * - 文档至少保留一个块（删空时自动补一个空段落）。
 */

import type { Annotation, Block, Doc } from './types.js';
import { createBlock } from './types.js';
import { reconcileGroupCommentsAfterInsert, reconcileGroupCommentsAfterMove } from './group-comments/index.js';
import { reconcileGroupMarksAfterInsert, reconcileGroupMarksAfterMove } from './groupMarks.js';
import { normalizeBlock } from './blockFormat.js';
import { tocWithoutBlocks } from './toc.js';

export type Op =
  | { readonly t: 'insertBlocks'; readonly at: number; readonly blocks: readonly Block[] }
  | { readonly t: 'removeBlocks'; readonly ids: readonly string[] }
  | { readonly t: 'moveBlocks'; readonly ids: readonly string[]; readonly at: number }
  | { readonly t: 'patchBlock'; readonly id: string; readonly patch: Partial<Block> }
  | { readonly t: 'patchDoc'; readonly patch: Partial<Omit<Doc, 'blocks'>> };

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

function insertBlocks(doc: Doc, at: number, blocks: readonly Block[]): Doc {
  if (!blocks.length) return doc;
  const normalized = blocks.map(normalizeBlock);
  const list = [...doc.blocks];
  list.splice(clamp(at, 0, list.length), 0, ...normalized);
  const ids = normalized.map((block) => block.id);
  let annotations = reconcileGroupMarksAfterInsert(doc, ids, list);
  const withMarks = annotations === doc.annotations ? doc : { ...doc, annotations };
  annotations = reconcileGroupCommentsAfterInsert(withMarks, ids, list);
  return annotations === doc.annotations
    ? { ...doc, blocks: list }
    : { ...doc, blocks: list, annotations };
}

function removeBlocks(doc: Doc, ids: readonly string[]): Doc {
  if (!ids.length) return doc;
  const drop = new Set(ids);
  const list = doc.blocks.filter((block) => !drop.has(block.id));
  if (list.length === doc.blocks.length) return doc;
  const safe = list.length ? list : [createBlock('paragraph')];
  const toc = tocWithoutBlocks(doc.toc, ids);
  let next: Doc = toc ? { ...doc, blocks: safe, toc } : { ...doc, blocks: safe };
  if (!doc.annotations.length) return next;
  const annotations: Annotation[] = [];
  for (const annotation of doc.annotations) {
    const members = annotation.anchor.blockIds?.filter((id) => !drop.has(id));
    if (members) {
      if (!members.length) continue;
      if (members.length === 1) {
        annotations.push({ ...annotation, anchor: { blockId: members[0] } });
      } else {
        annotations.push({ ...annotation, anchor: { blockId: members[0], blockIds: members } });
      }
    } else if (!drop.has(annotation.anchor.blockId)) {
      annotations.push(annotation);
    }
  }
  next = { ...next, annotations };
  return next;
}

function moveBlocks(doc: Doc, ids: readonly string[], at: number): Doc {
  if (!ids.length) return doc;
  const moving = new Set(ids);
  const moved = doc.blocks.filter((block) => moving.has(block.id));
  if (!moved.length) return doc;
  const rest = doc.blocks.filter((block) => !moving.has(block.id));
  const target = clamp(at, 0, rest.length);
  // 位置没变：整体顺序相同则视为无操作
  const next = [...rest.slice(0, target), ...moved, ...rest.slice(target)];
  if (next.length === doc.blocks.length && next.every((block, index) => block === doc.blocks[index])) return doc;
  let annotations = reconcileGroupMarksAfterMove(doc, ids, next);
  const withMarks = annotations === doc.annotations ? doc : { ...doc, annotations };
  annotations = reconcileGroupCommentsAfterMove(withMarks, ids, next);
  return annotations === doc.annotations
    ? { ...doc, blocks: next }
    : { ...doc, blocks: next, annotations };
}

function patchBlock(doc: Doc, id: string, patch: Partial<Block>): Doc {
  const index = doc.blocks.findIndex((block) => block.id === id);
  if (index < 0) return doc;
  const current = doc.blocks[index];
  const next = { ...current, ...patch, id: current.id };
  for (const key of Object.keys(patch) as (keyof Block)[]) {
    if (patch[key] === undefined) delete (next as Record<string, unknown>)[key];
  }
  const normalized = normalizeBlock(next);
  if (shallowEqual(current, normalized)) return doc;
  const list = [...doc.blocks];
  list[index] = normalized;
  return { ...doc, blocks: list };
}

function patchDoc(doc: Doc, patch: Partial<Omit<Doc, 'blocks'>>): Doc {
  const next = { ...doc, ...patch, schema: 4 as const };
  if (shallowEqual(doc, next)) return doc;
  return next;
}

function shallowEqual(a: object, b: object): boolean {
  const keysA = Object.keys(a) as (keyof typeof a)[];
  const keysB = Object.keys(b) as (keyof typeof b)[];
  if (keysA.length !== keysB.length) return false;
  for (const key of keysA) if (a[key] !== b[key]) return false;
  return true;
}

/** 执行一批操作，返回新文档；没有任何变化时返回原引用。 */
export function applyOps(doc: Doc, ops: readonly Op[]): Doc {
  let next = doc;
  for (const op of ops) {
    switch (op.t) {
      case 'insertBlocks':
        next = insertBlocks(next, op.at, op.blocks);
        break;
      case 'removeBlocks':
        next = removeBlocks(next, op.ids);
        break;
      case 'moveBlocks':
        next = moveBlocks(next, op.ids, op.at);
        break;
      case 'patchBlock':
        next = patchBlock(next, op.id, op.patch);
        break;
      case 'patchDoc':
        next = patchDoc(next, op.patch);
        break;
    }
  }
  return next;
}
