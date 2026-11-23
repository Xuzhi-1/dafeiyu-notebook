/** 文本块格式不变式：空文本块不保存字体字号。 */

import type { Block } from './types.js';
import { plainText } from './toc.js';

const TEXT_BLOCKS = new Set<Block['type']>(['paragraph', 'quote', 'bullet', 'number']);

/** 空文本块只保留内容和结构属性，不保留字体字号。 */
export function normalizeBlock(block: Block): Block {
  if (!TEXT_BLOCKS.has(block.type) || plainText(block.html).trim()) return block;
  if (block.fontFamily === undefined && block.fontSize === undefined) return block;
  const { fontFamily: _family, fontSize: _size, ...rest } = block;
  return rest;
}
