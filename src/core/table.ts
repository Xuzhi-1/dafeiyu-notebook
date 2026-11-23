/** 表格数据操作：纯函数，输出 patchBlock 原语，不碰 DOM。 */

import type { Block, CellAlign, Doc, TableCellSpan } from './types.js';
import { createBlock } from './types.js';
import type { Op } from './ops.js';
import { adjustSpansForColumns, adjustSpansForRows, mergeRange, splitCell, tableGrid } from './tableSpans.js';

export const TABLE_MIN_ROWS = 1;
export const TABLE_MIN_COLUMNS = 1;
export const TABLE_MAX_ROWS = 50;
export const TABLE_MAX_COLUMNS = 50;
export const TABLE_MIN_COLUMN_PERCENT = 2;
export const TABLE_MIN_ROW_HEIGHT = 24;
export const TABLE_MAX_ROW_HEIGHT = 1200;

function tableBlock(doc: Doc, id: string): Block | undefined {
  const block = doc.blocks.find((item) => item.id === id);
  return block?.type === 'table' ? block : undefined;
}

function normalizeRows(block: Block): string[][] {
  const raw = block.meta?.rows ?? [];
  if (!raw.length) return [['']];
  const width = Math.max(TABLE_MIN_COLUMNS, Math.min(TABLE_MAX_COLUMNS, Math.max(...raw.map((row) => row.length))));
  return raw
    .slice(0, TABLE_MAX_ROWS)
    .map((row) => Array.from({ length: width }, (_, index) => String(row[index] ?? '')));
}

type TableMetaPatch = {
  rowHeights?: number[];
  cellAligns?: CellAlign[][];
  columnWidths?: number[];
  spans?: (TableCellSpan | null)[][];
  header?: boolean;
  richText?: boolean;
};

function tablePatch(block: Block, rows: string[][], patch: TableMetaPatch = {}): Op[] {
  return [{ t: 'patchBlock', id: block.id, patch: { meta: { ...(block.meta ?? {}), ...patch, rows } } }];
}

function oldRows(block: Block): string[][] {
  return normalizeRows(block).map((row) => [...row]);
}

function clampIndex(value: number | undefined, max: number): number {
  if (value === undefined || !Number.isFinite(value)) return max;
  return Math.max(0, Math.min(max, Math.trunc(value)));
}

function normalizedColumnWidths(block: Block, width: number): number[] | null {
  const raw = block.meta?.columnWidths;
  if (!raw || raw.length !== width) return null;
  const values = raw.map((value) => Math.max(TABLE_MIN_COLUMN_PERCENT, Number.isFinite(value) ? value : 100 / width));
  const total = values.reduce((sum, value) => sum + value, 0);
  if (total <= 0) return null;
  return values.map((value) => (value / total) * 100);
}

function normalizedCellAligns(block: Block, rows: number, width: number): CellAlign[][] | null {
  const raw = block.meta?.cellAligns;
  if (!raw || raw.length !== rows) return null;
  const values: CellAlign[][] = [];
  for (const row of raw) {
    if (row.length !== width) return null;
    values.push(row.map((value) => value === 'center' || value === 'right' || value === 'justify' ? value : 'left'));
  }
  return values;
}

function normalizedRowHeights(block: Block, count: number): number[] | null {
  const raw = block.meta?.rowHeights;
  if (!raw || raw.length !== count) return null;
  return raw.map((value) => Math.min(TABLE_MAX_ROW_HEIGHT, Math.max(TABLE_MIN_ROW_HEIGHT, Number.isFinite(value) ? value : TABLE_MIN_ROW_HEIGHT)));
}

export function clampTableSize(rows: number, columns: number): { rows: number; columns: number } {
  return {
    rows: Math.max(TABLE_MIN_ROWS, Math.min(TABLE_MAX_ROWS, Math.trunc(rows) || TABLE_MIN_ROWS)),
    columns: Math.max(TABLE_MIN_COLUMNS, Math.min(TABLE_MAX_COLUMNS, Math.trunc(columns) || TABLE_MIN_COLUMNS)),
  };
}

export function createTableBlock(rows: number, columns: number): Block {
  const size = clampTableSize(rows, columns);
  return {
    ...createBlock('table'),
    meta: {
      rows: Array.from({ length: size.rows }, () => Array.from({ length: size.columns }, () => '')),
      header: false,
      richText: true,
    },
  };
}

export function tableCellHtml(block: Block, row: number, column: number): string | null {
  if (block.type !== 'table') return null;
  const anchor = tableGrid(block).anchorAt(row, column);
  if (!anchor) return null;
  const value = block.meta?.rows?.[anchor.row]?.[anchor.column];
  return value === undefined ? null : String(value);
}

export function tableInsertRowOp(doc: Doc, id: string, at?: number): Op[] | null {
  const block = tableBlock(doc, id);
  if (!block) return null;
  const rows = normalizeRows(block);
  if (rows.length >= TABLE_MAX_ROWS) return null;
  const beforeRows = oldRows(block);
  const index = clampIndex(at, rows.length);
  const previousHeightCount = rows.length;
  const previousWidth = rows[0]?.length ?? 1;
  rows.splice(index, 0, Array.from({ length: previousWidth }, () => ''));
  const heights = normalizedRowHeights(block, previousHeightCount);
  const aligns = normalizedCellAligns(block, previousHeightCount, previousWidth);
  const patch: TableMetaPatch = {};
  if (heights) { heights.splice(index, 0, TABLE_MIN_ROW_HEIGHT); patch.rowHeights = heights; }
  if (aligns) { aligns.splice(index, 0, Array.from({ length: previousWidth }, () => 'left')); patch.cellAligns = aligns; }
  const spans = adjustSpansForRows(block, beforeRows, rows, index, false);
  if (spans) patch.spans = spans;
  return tablePatch(block, rows, patch);
}

export function tableRemoveRowOp(doc: Doc, id: string, at?: number): Op[] | null {
  const block = tableBlock(doc, id);
  if (!block) return null;
  const rows = normalizeRows(block);
  if (rows.length <= TABLE_MIN_ROWS) return null;
  const beforeRows = oldRows(block);
  const index = clampIndex(at, rows.length - 1);
  const previousHeightCount = rows.length;
  const previousWidth = rows[0]?.length ?? 1;
  rows.splice(index, 1);
  const heights = normalizedRowHeights(block, previousHeightCount);
  const aligns = normalizedCellAligns(block, previousHeightCount, previousWidth);
  const patch: TableMetaPatch = {};
  if (heights) { heights.splice(index, 1); patch.rowHeights = heights; }
  if (aligns) { aligns.splice(index, 1); patch.cellAligns = aligns; }
  const spans = adjustSpansForRows(block, beforeRows, rows, index, true);
  if (spans) patch.spans = spans;
  return tablePatch(block, rows, patch);
}

export function tableInsertColumnOp(doc: Doc, id: string, at?: number): Op[] | null {
  const block = tableBlock(doc, id);
  if (!block) return null;
  const rows = normalizeRows(block);
  const beforeRows = oldRows(block);
  const width = rows[0]?.length ?? 1;
  if (width >= TABLE_MAX_COLUMNS) return null;
  const index = clampIndex(at, width);
  for (const row of rows) row.splice(index, 0, '');
  const widths = normalizedColumnWidths(block, width);
  const aligns = normalizedCellAligns(block, rows.length, width);
  const patch: TableMetaPatch = {};
  if (widths) {
    const nextWidth = 100 / (width + 1);
    const scaled = widths.map((value) => (value * width) / (width + 1));
    scaled.splice(index, 0, nextWidth);
    patch.columnWidths = scaled;
  }
  if (aligns) {
    for (const row of aligns) row.splice(index, 0, 'left');
    patch.cellAligns = aligns;
  }
  const spans = adjustSpansForColumns(block, beforeRows, rows, index, false);
  if (spans) patch.spans = spans;
  return tablePatch(block, rows, patch);
}

export function tableRemoveColumnOp(doc: Doc, id: string, at?: number): Op[] | null {
  const block = tableBlock(doc, id);
  if (!block) return null;
  const rows = normalizeRows(block);
  const beforeRows = oldRows(block);
  const width = rows[0]?.length ?? 1;
  if (width <= TABLE_MIN_COLUMNS) return null;
  const index = clampIndex(at, width - 1);
  for (const row of rows) row.splice(index, 1);
  const widths = normalizedColumnWidths(block, width);
  const aligns = normalizedCellAligns(block, rows.length, width);
  const patch: TableMetaPatch = {};
  if (widths) {
    widths.splice(index, 1);
    const total = widths.reduce((sum, value) => sum + value, 0);
    patch.columnWidths = widths.map((value) => (value / total) * 100);
  }
  if (aligns) {
    for (const row of aligns) row.splice(index, 1);
    patch.cellAligns = aligns;
  }
  const spans = adjustSpansForColumns(block, beforeRows, rows, index, true);
  if (spans) patch.spans = spans;
  return tablePatch(block, rows, patch);
}

export function tableAddRowOp(doc: Doc, id: string): Op[] | null {
  const block = tableBlock(doc, id);
  if (!block) return null;
  return tableInsertRowOp(doc, id, normalizeRows(block).length);
}

export function tableAddColumnOp(doc: Doc, id: string): Op[] | null {
  const block = tableBlock(doc, id);
  if (!block) return null;
  return tableInsertColumnOp(doc, id, normalizeRows(block)[0]?.length ?? 1);
}

export function tableSetCellOp(doc: Doc, id: string, row: number, column: number, text: string): Op[] | null {
  const block = tableBlock(doc, id);
  if (!block) return null;
  const rows = normalizeRows(block);
  const anchor = tableGrid(block).anchorAt(row, column);
  if (!anchor || !rows[anchor.row] || rows[anchor.row][anchor.column] === undefined) return null;
  if (rows[anchor.row][anchor.column] === text) return null;
  rows[anchor.row][anchor.column] = text;
  return tablePatch(block, rows);
}

export function tableSetColumnWidthsOp(doc: Doc, id: string, values: readonly number[]): Op[] | null {
  const block = tableBlock(doc, id);
  if (!block) return null;
  const width = normalizeRows(block)[0]?.length ?? 1;
  if (values.length !== width) return null;
  const clamped = values.map((value) => Math.max(TABLE_MIN_COLUMN_PERCENT, Number.isFinite(value) ? value : 100 / width));
  const total = clamped.reduce((sum, value) => sum + value, 0);
  if (total <= 0) return null;
  const normalized = clamped.map((value) => (value / total) * 100);
  const previous = normalizedColumnWidths(block, width);
  if (previous && previous.every((value, index) => Math.abs(value - normalized[index]) < 0.01)) return null;
  return tablePatch(block, normalizeRows(block), { columnWidths: normalized });
}

export function tableSetRowHeightsOp(doc: Doc, id: string, values: readonly number[]): Op[] | null {
  const block = tableBlock(doc, id);
  if (!block) return null;
  const rows = normalizeRows(block);
  if (values.length !== rows.length) return null;
  const normalized = values.map((value) => Math.min(TABLE_MAX_ROW_HEIGHT, Math.max(TABLE_MIN_ROW_HEIGHT, Number.isFinite(value) ? value : TABLE_MIN_ROW_HEIGHT)));
  const previous = normalizedRowHeights(block, rows.length);
  if (previous && previous.every((value, index) => Math.abs(value - normalized[index]) < 0.5)) return null;
  return tablePatch(block, rows, { rowHeights: normalized });
}

export function tableSetCellAlignOp(doc: Doc, id: string, row: number, column: number, align: CellAlign): Op[] | null {
  const block = tableBlock(doc, id);
  if (!block) return null;
  const rows = normalizeRows(block);
  if (!rows[row] || rows[row][column] === undefined) return null;
  const previous = normalizedCellAligns(block, rows.length, rows[0].length);
  const aligns = previous ?? rows.map((cells) => cells.map(() => 'left' as CellAlign));
  if (aligns[row][column] === align) return null;
  aligns[row][column] = align;
  return tablePatch(block, rows, { cellAligns: aligns });
}

export function tableToggleHeaderOp(doc: Doc, id: string): Op[] | null {
  const block = tableBlock(doc, id);
  if (!block) return null;
  return tablePatch(block, normalizeRows(block), { header: !(block.meta?.header ?? false) });
}

export function tableMergeCellsOp(doc: Doc, id: string, top: number, left: number, bottom: number, right: number): Op[] | null {
  const block = tableBlock(doc, id);
  if (!block) return null;
  const result = mergeRange(block, top, left, bottom, right);
  if (!result) return null;
  return tablePatch(block, result.rows, { spans: result.spans });
}

export function tableSplitCellOp(doc: Doc, id: string, row: number, column: number): Op[] | null {
  const block = tableBlock(doc, id);
  if (!block) return null;
  const spans = splitCell(block, row, column);
  if (!spans) return null;
  return tablePatch(block, normalizeRows(block), { spans });
}
