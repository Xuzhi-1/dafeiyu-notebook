/**
 * 表格块视图：从 meta.rows 渲染成 <table>，单元格可直接编辑。
 */

import type { Block } from '../../core/types.js';
import { sanitizeInline } from '../sanitize.js';
import { tableGrid } from '../../core/tableSpans.js';

export function createTableView(block: Block): HTMLElement {
  const el = document.createElement('div');
  el.className = 'block block-table';
  el.dataset.id = block.id;
  renderTable(el, block);
  return el;
}

export function renderTable(el: HTMLElement, block: Block): void {
  const grid = tableGrid(block);
  const rows = grid.rows;
  const header = block.meta?.header ?? false;
  const table = document.createElement('table');
  table.className = 'doc-table';
  const width = grid.width;
  const colgroup = document.createElement('colgroup');
  for (let column = 0; column < width; column += 1) colgroup.appendChild(document.createElement('col'));
  table.appendChild(colgroup);
  rows.forEach((cells, rowIndex) => {
    const tr = document.createElement('tr');
    cells.forEach((text, columnIndex) => {
      const span = grid.spans?.[rowIndex]?.[columnIndex];
      if (grid.spans && !span) return;
      const isHeader = header && rowIndex === 0;
      const cell = document.createElement(isHeader ? 'th' : 'td');
      if (block.meta?.richText) cell.innerHTML = sanitizeInline(text);
      else cell.textContent = text;
      cell.contentEditable = 'true';
      cell.spellcheck = false;
      cell.dataset.row = String(rowIndex);
      cell.dataset.column = String(columnIndex);
      if (span && span.rowSpan > 1) cell.rowSpan = span.rowSpan;
      if (span && span.colSpan > 1) cell.colSpan = span.colSpan;
      tr.appendChild(cell);
    });
    table.appendChild(tr);
  });
  el.replaceChildren(table);
  applyTableSizing(el, block);
}

export function applyTableSizing(el: HTMLElement, block: Block): void {
  const grid = tableGrid(block);
  const width = grid.width;
  const table = el.querySelector<HTMLTableElement>('.doc-table');
  if (!table || width < 1) return;
  const widths = block.meta?.columnWidths;
  const columns = table.querySelectorAll<HTMLTableColElement>('colgroup col');
  columns.forEach((col, index) => {
    const value = widths && widths.length === width ? widths[index] : 100 / width;
    col.style.width = `${value}%`;
  });
  const heights = block.meta?.rowHeights;
  const aligns = block.meta?.cellAligns;
  table.querySelectorAll<HTMLTableRowElement>('tbody tr, tr').forEach((row, index) => {
    const value = heights && heights.length === grid.height ? heights[index] : null;
    row.style.height = value ? `${value}px` : '';
    row.querySelectorAll<HTMLElement>('td, th').forEach((cell) => {
      const column = Number(cell.dataset.column);
      const align = aligns && aligns.length === grid.height && aligns[index]?.length === width ? aligns[index][column] : null;
      cell.style.textAlign = align ?? '';
    });
  });
}
