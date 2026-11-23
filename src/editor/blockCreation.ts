/** 统一的空文本块创建入口，避免各调用方写入不同初始格式。 */

import { selectMany } from '../core/selection.js';
import type { Store } from '../core/store.js';
import { createBlock, type Block } from '../core/types.js';
import { plainText } from '../core/toc.js';

export function createSplitTextBlock(source: Block, afterHtml: string): Block {
  const hasTail = Boolean(plainText(afterHtml).trim());
  return {
    ...createBlock(source.type),
    html: afterHtml,
    ...(source.align !== undefined ? { align: source.align } : {}),
    ...(source.indent !== undefined ? { indent: source.indent } : {}),
    ...(hasTail && source.fontFamily ? { fontFamily: source.fontFamily } : {}),
    ...(hasTail && source.fontSize ? { fontSize: source.fontSize } : {}),
  };
}

export function insertEmptyTextBlock(store: Store, at: number, selectBlock = false): Block {
  const block: Block = createBlock('paragraph');
  store.dispatch(
    (doc) => [{ t: 'insertBlocks', at: Math.min(Math.max(at, 0), doc.blocks.length), blocks: [block] }],
    selectBlock ? selectMany([block.id]) : undefined,
  );
  return block;
}
