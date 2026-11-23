/** 表格行列尺寸拖动：只在列/行边界附近启动，结束时一次性写回模型。 */

import type { Store } from '../../core/store.js';
import { tableSetColumnWidthsOp, tableSetRowHeightsOp } from '../../core/table.js';

interface TablePoint {
  cell: HTMLElement | null;
  table: HTMLTableElement;
  tableRect: DOMRect;
}

export function attachTableResize(store: Store, host: HTMLElement): void {
  const pointAt = (event: PointerEvent): TablePoint | null => {
    const target = event.target;
    if (!(target instanceof Element)) return null;
    const table = target.closest<HTMLTableElement>('.doc-table')
      ?? target.closest<HTMLElement>('.block-table')?.querySelector<HTMLTableElement>('.doc-table');
    if (!table) return null;
    const cell = target.closest<HTMLElement>('td[data-row][data-column], th[data-row][data-column]');
    return { cell, table, tableRect: table.getBoundingClientRect() };
  };

  const modeAt = (event: PointerEvent, point: TablePoint): { mode: 'column' | 'row' | 'bottom'; index: number } | null => {
    const firstRow = point.table.querySelector('tr');
    if (!firstRow) return null;
    const cells = [...firstRow.children] as HTMLElement[];
    const rows = [...point.table.querySelectorAll<HTMLTableRowElement>('tr')];
    if (rows.length && Math.abs(point.tableRect.bottom - event.clientY) <= 8) {
      return { mode: 'bottom', index: rows.length - 1 };
    }
    let column = -1;
    let columnDistance = 7;
    for (let index = 0; index < cells.length - 1; index += 1) {
      const distance = Math.abs(cells[index].getBoundingClientRect().right - event.clientX);
      if (distance < columnDistance) {
        column = index;
        columnDistance = distance;
      }
    }
    let row = -1;
    let rowDistance = 7;
    for (let index = 0; index < rows.length - 1; index += 1) {
      const distance = Math.abs(rows[index].getBoundingClientRect().bottom - event.clientY);
      if (distance < rowDistance) {
        row = index;
        rowDistance = distance;
      }
    }
    if (column >= 0 && (row < 0 || columnDistance <= rowDistance)) return { mode: 'column', index: column };
    if (row >= 0) return { mode: 'row', index: row };
    return null;
  };

  host.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    const point = pointAt(event);
    if (!point) return;
    const boundary = modeAt(event, point);
    if (!boundary) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const blockId = point.table.closest<HTMLElement>('.block')?.dataset.id;
    if (!blockId) return;
    const rowMode = boundary.mode === 'row' || boundary.mode === 'bottom';
    point.table.style.cursor = rowMode ? 'row-resize' : 'col-resize';
    if (point.cell) point.cell.style.cursor = rowMode ? 'row-resize' : 'col-resize';
    document.body.classList.add('is-table-resizing');
    document.body.classList.toggle('is-table-resizing-row', rowMode);
    const rows = point.table.querySelectorAll<HTMLTableRowElement>('tr');
    const columns = point.table.querySelectorAll<HTMLTableColElement>('colgroup col');
    const startX = event.clientX;
    const startY = event.clientY;
    const initialColumns = [...columns].map((_, index) => {
      const cell = rows[0]?.children[index] as HTMLElement | undefined;
      return cell?.getBoundingClientRect().width ?? 0;
    });
    const initialRows = [...rows].map((row) => row.getBoundingClientRect().height);
    const columnIndex = boundary.mode === 'column' ? boundary.index : -1;
    const rowIndex = rowMode ? boundary.index : -1;
    const tableWidth = point.tableRect.width;

    for (const [index, width] of initialColumns.entries()) {
      const col = columns[index];
      if (col) col.style.width = `${width}px`;
    }

    const applyColumn = (clientX: number): void => {
      if (columnIndex < 0) return;
      const delta = clientX - startX;
      const left = initialColumns[columnIndex];
      const right = initialColumns[columnIndex + 1] ?? 0;
      if (left === undefined || right === undefined) return;
      const nextLeft = Math.max(40, Math.min(left + right - 40, left + delta));
      const nextRight = left + right - nextLeft;
      columns[columnIndex]!.style.width = `${nextLeft}px`;
      columns[columnIndex + 1]!.style.width = `${nextRight}px`;
    };

    const applyRow = (clientY: number): void => {
      if (rowIndex < 0) return;
      const delta = clientY - startY;
      const top = initialRows[rowIndex];
      if (top === undefined) return;
      rows[rowIndex]!.style.height = `${Math.max(30, top + delta)}px`;
    };

    const onMove = (move: PointerEvent): void => {
      if (boundary.mode === 'column') applyColumn(move.clientX);
      else applyRow(move.clientY);
    };

    const cleanup = (): void => {
      document.body.classList.remove('is-table-resizing', 'is-table-resizing-row');
      point.table.style.cursor = '';
      if (point.cell) point.cell.style.cursor = '';
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      document.removeEventListener('pointercancel', onCancel);
    };

    const onUp = (): void => {
      const widths = [...(rows[0]?.children ?? [])].map((cell) => {
        const rect = (cell as HTMLElement).getBoundingClientRect();
        return tableWidth > 0 ? (rect.width / tableWidth) * 100 : 0;
      });
      const heights = [...rows].map((row) => row.getBoundingClientRect().height);
      cleanup();
      if (boundary.mode === 'column') store.dispatch(() => tableSetColumnWidthsOp(store.doc, blockId, widths));
      else store.dispatch(() => tableSetRowHeightsOp(store.doc, blockId, heights));
    };

    const onCancel = (): void => {
      cleanup();
      for (const [index, width] of initialColumns.entries()) {
        const col = columns[index];
        if (col) col.style.width = `${width}px`;
      }
      for (const [index, height] of initialRows.entries()) {
        const row = rows[index];
        if (row) row.style.height = `${height}px`;
      }
    };

    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
    document.addEventListener('pointercancel', onCancel);
  }, true);
}
