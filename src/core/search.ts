/**
 * 搜索：纯查询函数，不碰 DOM。
 * 命中来源：块正文 + 注释文字。返回按文档顺序排列的摘要。
 */

import type { CommentAnnotation, Doc } from './types.js';
import { plainText } from './toc.js';
import { tableCellHtml } from './table.js';
import { tableGrid } from './tableSpans.js';
import { normalizeChart } from './chart.js';

export const SEARCH_SNIPPET_BEFORE = 24;
export const SEARCH_SNIPPET_AFTER = 60;

/** 搜索展示注释的适配器；具体清洗与计数由 comments 模块提供。 */
export interface SearchCommentGroup {
  readonly id: string;
  readonly color?: string;
}

export interface SearchCommentPort {
  render(note: CommentAnnotation): string;
  groupForBlock(doc: Doc, blockId: string): SearchCommentGroup | undefined;
}

export interface SearchCell {
  readonly row: number;
  readonly column: number;
}

export interface SearchHit {
  readonly blockId: string;
  readonly noteId?: string;
  readonly kind: 'text' | 'note' | 'chart';
  readonly chartField?: 'title' | 'category' | 'series';
  readonly snippet: string;
  readonly index: number;
  readonly cell?: SearchCell;
}

export function searchDoc(doc: Doc, query: string, limit = Number.POSITIVE_INFINITY): SearchHit[] {
  const keyword = query.trim().toLowerCase();
  if (!keyword || limit <= 0) return [];
  const hits: SearchHit[] = [];
  const addHit = (hit: SearchHit): boolean => {
    hits.push(hit);
    return hits.length >= limit;
  };

  // 注释按块索引，避免每个块都遍历全部注释（O(块数 × 注释数)）。
  const notesByBlock = new Map<string, CommentAnnotation[]>();
  for (const note of doc.annotations) {
    if (note.type !== 'comment') continue;
    const blockId = note.anchor.blockIds?.length
      ? note.anchor.blockIds[note.anchor.blockIds.length - 1]
      : note.anchor.blockId;
    const list = notesByBlock.get(blockId);
    if (list) list.push(note);
    else notesByBlock.set(blockId, [note]);
  }

  for (const block of doc.blocks) {
    if (block.type === 'table') {
      const grid = tableGrid(block);
      const rows = grid.rows;
      for (let row = 0; row < rows.length; row += 1) {
        for (let column = 0; column < rows[row].length; column += 1) {
          const anchor = grid.anchorAt(row, column);
          if (!anchor || anchor.row !== row || anchor.column !== column) continue;
          const raw = tableCellHtml(block, row, column) ?? '';
          const text = block.meta?.richText ? plainText(raw) : raw;
          const textIndex = text.toLowerCase().indexOf(keyword);
          if (textIndex >= 0) {
            if (addHit({
              blockId: block.id,
              kind: 'text',
              index: textIndex,
              snippet: snippetAround(text, textIndex, keyword.length),
              cell: { row, column },
            })) return hits;
          }
        }
      }
    } else {
      if (block.type === 'chart') {
        const chart = normalizeChart(block.meta?.chart);
        const fields: { field: 'title' | 'category' | 'series'; text: string }[] = [];
        if (chart.title.trim()) fields.push({ field: 'title', text: chart.title.trim() });
        for (const category of chart.categories) {
          if (category.trim()) fields.push({ field: 'category', text: category.trim() });
        }
        for (const series of chart.series) {
          if (series.name.trim()) fields.push({ field: 'series', text: series.name.trim() });
        }
        for (const item of fields) {
          const textIndex = item.text.toLowerCase().indexOf(keyword);
          if (textIndex < 0) continue;
          const label = item.field === 'title' ? '标题' : item.field === 'category' ? '分类' : '系列';
          const snippet = `${label}：${snippetAround(item.text, textIndex, keyword.length)}`;
          if (addHit({ blockId: block.id, kind: 'chart', chartField: item.field, index: textIndex, snippet })) return hits;
        }
      } else {
        const text = plainText(block.html);
        const textIndex = text.toLowerCase().indexOf(keyword);
        if (textIndex >= 0) {
          if (addHit({
            blockId: block.id,
            kind: 'text',
            index: textIndex,
            snippet: snippetAround(text, textIndex, keyword.length),
          })) return hits;
        }
      }
    }
    for (const note of notesByBlock.get(block.id) ?? []) {
      const noteBlockId = note.anchor.blockIds?.length
        ? note.anchor.blockIds[note.anchor.blockIds.length - 1]
        : note.anchor.blockId;
      const noteText = plainText(note.html);
      const noteIndex = noteText.toLowerCase().indexOf(keyword);
      if (noteIndex >= 0) {
        if (addHit({
          blockId: noteBlockId,
          noteId: note.id,
          kind: 'note',
          index: noteIndex,
          snippet: snippetAround(noteText, noteIndex, keyword.length),
        })) return hits;
      }
    }
  }
  return hits;
}

function snippetAround(text: string, index: number, length: number): string {
  const start = Math.max(0, index - SEARCH_SNIPPET_BEFORE);
  const end = Math.min(text.length, index + length + SEARCH_SNIPPET_AFTER);
  const prefix = start > 0 ? '…' : '';
  const suffix = end < text.length ? '…' : '';
  return `${prefix}${text.slice(start, end)}${suffix}`;
}
