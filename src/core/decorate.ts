/**
 * 装饰层：把“文档 + 界面状态”算成渲染需要的视图数据，不写进文档。
 * 目录展开/折叠、层级、计数都在这里算。
 */

import type { Doc, TocEntry } from './types.js';

export interface OutlineNode {
  readonly entry: TocEntry;
  readonly depth: number;
  readonly hasChildren: boolean;
}

export interface Outline {
  /** 按文档顺序展开后的可见节点（折叠节点的子项不出现） */
  readonly nodes: readonly OutlineNode[];
  /** 全部目录项数量（角标用） */
  readonly total: number;
  readonly byId: ReadonlyMap<string, TocEntry>;
  readonly childrenOf: ReadonlyMap<string | null, readonly TocEntry[]>;
}

export function buildOutline(doc: Doc): Outline {
  const byId = new Map(doc.toc.map((entry) => [entry.id, entry]));
  const childrenOf = new Map<string | null, TocEntry[]>();
  for (const entry of doc.toc) {
    const parent = entry.parentId && byId.has(entry.parentId) ? entry.parentId : null;
    const list = childrenOf.get(parent) ?? [];
    list.push(entry);
    childrenOf.set(parent, list);
  }

  const nodes: OutlineNode[] = [];
  const walk = (parentId: string | null, depth: number) => {
    for (const entry of childrenOf.get(parentId) ?? []) {
      const children = childrenOf.get(entry.id) ?? [];
      nodes.push({ entry, depth, hasChildren: children.length > 0 });
      if (!entry.collapsed) walk(entry.id, depth + 1);
    }
  };
  walk(null, 0);

  return { nodes, total: doc.toc.length, byId, childrenOf };
}

/** 某个块是否是目录项（单块或组目录） */
export function outlineEntryForBlock(doc: Doc, blockId: string): TocEntry | undefined {
  return doc.toc.find((entry) => entry.blockId === blockId || entry.blockIds.includes(blockId));
}

/** 组目录的块 id 列表（单块目录返回自身） */
export function outlineBlockIds(entry: TocEntry): readonly string[] {
  return entry.blockIds.length ? entry.blockIds : [entry.blockId];
}
