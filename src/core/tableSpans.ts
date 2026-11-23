import type { Block, TableCellSpan } from './types.js';

export interface TableAnchor {
  row: number;
  column: number;
  span: TableCellSpan;
}

export interface TableGrid {
  rows: string[][];
  width: number;
  height: number;
  spans: (TableCellSpan | null)[][] | null;
  anchorAt(row: number, column: number): TableAnchor | null;
}

const NORMAL = (): TableCellSpan => ({ rowSpan: 1, colSpan: 1 });

function validSpan(value: unknown): value is TableCellSpan {
  if (!value || typeof value !== 'object') return false;
  const span = value as TableCellSpan;
  return Number.isInteger(span.rowSpan) && Number.isInteger(span.colSpan)
    && span.rowSpan >= 1 && span.colSpan >= 1;
}

export function tableRows(block: Block): string[][] {
  const raw = block.meta?.rows ?? [];
  if (!raw.length) return [['']];
  const width = Math.max(1, Math.min(50, Math.max(...raw.map((row) => row.length))));
  return raw.slice(0, 50).map((row) => Array.from({ length: width }, (_, index) => String(row[index] ?? '')));
}

/** 返回完整 spans 矩阵；null 表示普通表格。非法 spans 会安全回退为普通表格。 */
export function tableSpans(block: Block): (TableCellSpan | null)[][] | null {
  const rows = tableRows(block);
  const height = rows.length;
  const width = rows[0]?.length ?? 1;
  const raw = block.meta?.spans;
  if (!raw || raw.length !== height) return null;
  const anchors: TableAnchor[] = [];
  const assigned: boolean[][] = Array.from({ length: height }, () => Array(width).fill(false));
  for (let row = 0; row < height; row += 1) {
    const source = raw[row];
    if (!Array.isArray(source) || source.length !== width) return null;
    for (let column = 0; column < width; column += 1) {
      const value = source[column];
      if (value === null) continue;
      if (!validSpan(value)
        || row + value.rowSpan > height
        || column + value.colSpan > width) return null;
      for (let r = row; r < row + value.rowSpan; r += 1) {
        for (let c = column; c < column + value.colSpan; c += 1) {
          if (assigned[r][c]) return null;
          assigned[r][c] = true;
        }
      }
      anchors.push({ row, column, span: { rowSpan: value.rowSpan, colSpan: value.colSpan } });
    }
  }
  if (assigned.some((row) => row.some((value) => !value))) return null;
  return buildSpans(height, width, anchors);
}

function buildSpans(height: number, width: number, anchors: readonly TableAnchor[]): (TableCellSpan | null)[][] {
  const spans: (TableCellSpan | null)[][] = Array.from({ length: height }, () => Array(width).fill(null));
  for (const anchor of anchors) {
    if (anchor.row < 0 || anchor.column < 0
      || anchor.row + anchor.span.rowSpan > height
      || anchor.column + anchor.span.colSpan > width) continue;
    spans[anchor.row][anchor.column] = anchor.span;
    for (let row = anchor.row; row < anchor.row + anchor.span.rowSpan; row += 1) {
      for (let column = anchor.column; column < anchor.column + anchor.span.colSpan; column += 1) {
        if (row !== anchor.row || column !== anchor.column) spans[row][column] = null;
      }
    }
  }
  // 没有锚点的格子按普通单元格补齐。
  for (let row = 0; row < height; row += 1) {
    for (let column = 0; column < width; column += 1) {
      if (spans[row][column] === null && !isCovered(spans, row, column)) spans[row][column] = NORMAL();
    }
  }
  return spans;
}

function isCovered(spans: readonly (readonly (TableCellSpan | null)[])[], row: number, column: number): boolean {
  for (let r = 0; r < spans.length; r += 1) {
    for (let c = 0; c < (spans[r]?.length ?? 0); c += 1) {
      const span = spans[r][c];
      if (!span) continue;
      if (row >= r && row < r + span.rowSpan && column >= c && column < c + span.colSpan) {
        return r !== row || c !== column;
      }
    }
  }
  return false;
}

export function tableGrid(block: Block): TableGrid {
  const rows = tableRows(block);
  const height = rows.length;
  const width = rows[0]?.length ?? 1;
  const spans = tableSpans(block);
  const map: (TableAnchor | null)[][] = Array.from({ length: height }, () => Array(width).fill(null));
  if (spans) {
    for (let row = 0; row < height; row += 1) {
      for (let column = 0; column < width; column += 1) {
        const span = spans[row][column];
        if (!span) continue;
        const anchor = { row, column, span };
        for (let r = row; r < row + span.rowSpan; r += 1) {
          for (let c = column; c < column + span.colSpan; c += 1) map[r][c] = anchor;
        }
      }
    }
  }
  return {
    rows,
    width,
    height,
    spans,
    anchorAt(row, column) {
      if (!Number.isInteger(row) || !Number.isInteger(column)) return null;
      if (!spans) return { row, column, span: { rowSpan: 1, colSpan: 1 } };
      return map[row]?.[column] ?? null;
    },
  };
}

export function spansFromAnchors(height: number, width: number, anchors: readonly TableAnchor[]): (TableCellSpan | null)[][] {
  return buildSpans(height, width, anchors);
}

export function anchorList(spans: readonly (readonly (TableCellSpan | null)[])[]): TableAnchor[] {
  const result: TableAnchor[] = [];
  spans.forEach((row, rowIndex) => row.forEach((span, column) => {
    if (span) result.push({ row: rowIndex, column, span: { rowSpan: span.rowSpan, colSpan: span.colSpan } });
  }));
  return result;
}

/** 合并矩形；遇到跨越边界的已有合并时返回 null。 */
export function mergeRange(block: Block, top: number, left: number, bottom: number, right: number): {
  rows: string[][];
  spans: (TableCellSpan | null)[][];
} | null {
  const grid = tableGrid(block);
  const minRow = Math.max(0, Math.min(top, bottom));
  const maxRow = Math.min(grid.height - 1, Math.max(top, bottom));
  const minCol = Math.max(0, Math.min(left, right));
  const maxCol = Math.min(grid.width - 1, Math.max(left, right));
  if (minRow >= maxRow && minCol >= maxCol) return null;
  const current = grid.spans ?? spansFromAnchors(grid.height, grid.width, anchorList(tableGrid(block).spans ?? []));
  for (const anchor of anchorList(current)) {
    const endRow = anchor.row + anchor.span.rowSpan - 1;
    const endCol = anchor.column + anchor.span.colSpan - 1;
    const intersects = anchor.row <= maxRow && endRow >= minRow && anchor.column <= maxCol && endCol >= minCol;
    if (!intersects) continue;
    if (anchor.row < minRow || endRow > maxRow || anchor.column < minCol || endCol > maxCol) return null;
  }
  const parts: string[] = [];
  for (let row = minRow; row <= maxRow; row += 1) {
    for (let column = minCol; column <= maxCol; column += 1) {
      const anchor = grid.anchorAt(row, column);
      if (!anchor) continue;
      const text = (grid.rows[anchor.row]?.[anchor.column] ?? '').trim();
      if (text) parts.push(text);
    }
  }
  const rows = grid.rows.map((row) => [...row]);
  for (let row = minRow; row <= maxRow; row += 1) {
    for (let column = minCol; column <= maxCol; column += 1) rows[row][column] = '';
  }
  rows[minRow][minCol] = [...new Set(parts)].join('<br>');
  const anchors = anchorList(current).filter((anchor) => {
    const endRow = anchor.row + anchor.span.rowSpan - 1;
    const endCol = anchor.column + anchor.span.colSpan - 1;
    return !(anchor.row >= minRow && endRow <= maxRow && anchor.column >= minCol && endCol <= maxCol);
  });
  anchors.push({
    row: minRow,
    column: minCol,
    span: { rowSpan: maxRow - minRow + 1, colSpan: maxCol - minCol + 1 },
  });
  return { rows, spans: spansFromAnchors(grid.height, grid.width, anchors) };
}

export function splitCell(block: Block, row: number, column: number): (TableCellSpan | null)[][] | null {
  const grid = tableGrid(block);
  const anchor = grid.anchorAt(row, column);
  if (!anchor || (anchor.span.rowSpan === 1 && anchor.span.colSpan === 1)) return null;
  const anchors = anchorList(grid.spans ?? []).filter((item) => (
    item.row !== anchor.row || item.column !== anchor.column
  ));
  for (let r = anchor.row; r < anchor.row + anchor.span.rowSpan; r += 1) {
    for (let c = anchor.column; c < anchor.column + anchor.span.colSpan; c += 1) {
      anchors.push({ row: r, column: c, span: { rowSpan: 1, colSpan: 1 } });
    }
  }
  return spansFromAnchors(grid.height, grid.width, anchors);
}

export function adjustSpansForRows(
  block: Block,
  rowsBefore: string[][],
  rowsAfter: string[][],
  index: number,
  remove: boolean,
): (TableCellSpan | null)[][] | null {
  const spans = tableSpans(block);
  if (!spans) return null;
  const anchors: TableAnchor[] = [];
  const width = rowsBefore[0]?.length ?? 1;
  for (const anchor of anchorList(spans)) {
    let row = anchor.row;
    let rowSpan = anchor.span.rowSpan;
    if (remove) {
      if (row === index) {
        if (rowSpan === 1) continue;
        rowSpan -= 1;
      } else if (row < index && row + rowSpan > index) {
        rowSpan -= 1;
      } else if (row > index) {
        row -= 1;
      }
    } else {
      if (row < index && row + rowSpan > index) rowSpan += 1;
      else if (row >= index) row += 1;
    }
    if (rowSpan < 1) continue;
    if (remove && anchor.row === index && anchor.span.rowSpan > 1 && rowsAfter[row]) {
      rowsAfter[row][anchor.column] = rowsBefore[anchor.row]?.[anchor.column] ?? '';
    }
    anchors.push({ row, column: anchor.column, span: { rowSpan, colSpan: anchor.span.colSpan } });
  }
  return spansFromAnchors(rowsAfter.length, width, anchors);
}

export function adjustSpansForColumns(
  block: Block,
  rowsBefore: string[][],
  rowsAfter: string[][],
  index: number,
  remove: boolean,
): (TableCellSpan | null)[][] | null {
  const spans = tableSpans(block);
  if (!spans) return null;
  const anchors: TableAnchor[] = [];
  const height = rowsBefore.length;
  for (const anchor of anchorList(spans)) {
    let column = anchor.column;
    let colSpan = anchor.span.colSpan;
    if (remove) {
      if (column === index) {
        if (colSpan === 1) continue;
        colSpan -= 1;
      } else if (column < index && column + colSpan > index) {
        colSpan -= 1;
      } else if (column > index) {
        column -= 1;
      }
    } else {
      if (column < index && column + colSpan > index) colSpan += 1;
      else if (column >= index) column += 1;
    }
    if (colSpan < 1) continue;
    if (remove && anchor.column === index && anchor.span.colSpan > 1) {
      for (let offset = 0; offset < anchor.span.rowSpan; offset += 1) {
        const row = anchor.row + offset;
        if (!rowsAfter[row]) continue;
        rowsAfter[row][column] = rowsBefore[row]?.[anchor.column] ?? '';
      }
    }
    anchors.push({ row: anchor.row, column, span: { rowSpan: anchor.span.rowSpan, colSpan } });
  }
  return spansFromAnchors(height, rowsAfter[0]?.length ?? 1, anchors);
}
