/** 新建文本块时继承最近一个文本块的字体。 */

import type { Block } from '../core/types.js';

const TEXT_TYPES = new Set(['paragraph', 'quote', 'bullet', 'number']);

export function inheritedFontFamily(blocks: readonly Block[], beforeIndex = blocks.length): string | undefined {
  const from = Math.min(beforeIndex, blocks.length) - 1;
  for (let index = from; index >= 0; index -= 1) {
    const block = blocks[index];
    if (block && TEXT_TYPES.has(block.type) && block.fontFamily) return block.fontFamily;
  }
  return undefined;
}

export function withBlockFont(block: Block, fontFamily: string | undefined): Block {
  return fontFamily ? { ...block, fontFamily } : block;
}
