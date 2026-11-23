/** 文档内容量：正文/注释按字数，表格按已填写单元格，图表按个。 */

import type { Block, Doc } from './types.js';
import { plainText } from './toc.js';

const CJK = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/g;
const WORD = /[A-Za-z0-9]+(?:['’][A-Za-z0-9]+)*/g;
const TEXT_TYPES = new Set<Block['type']>(['paragraph', 'quote', 'bullet', 'number']);

function countText(html: string): number {
  const text = plainText(html);
  if (!text) return 0;
  const cjk = text.match(CJK)?.length ?? 0;
  const words = text.replace(CJK, ' ').match(WORD)?.length ?? 0;
  return cjk + words;
}

function countTable(block: Block): number {
  const rows = block.meta?.rows ?? [];
  const spans = block.meta?.spans;
  let count = 0;
  rows.forEach((row, rowIndex) => {
    row.forEach((cell, columnIndex) => {
      if (spans?.[rowIndex]?.[columnIndex] === null) return;
      if (plainText(cell).trim()) count += 1;
    });
  });
  return count;
}

export function countDocumentContent(doc: Doc): number {
  let count = 0;
  for (const block of doc.blocks) {
    if (TEXT_TYPES.has(block.type)) count += countText(block.html);
    else if (block.type === 'table') count += countTable(block);
    else if (block.type === 'chart') count += 1;
  }
  for (const annotation of doc.annotations) {
    if (annotation.type === 'comment') count += countText(annotation.html);
  }
  return count;
}
