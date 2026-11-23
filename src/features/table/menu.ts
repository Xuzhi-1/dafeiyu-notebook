/** 表格单元格右键菜单：插入/删除行列。 */

import type { Store } from '../../core/store.js';
import { selectMany } from '../../core/selection.js';
import { blockActionItems, type BlockMenuActions } from '../blocks/menu.js';
import {
  tableInsertColumnOp, tableInsertRowOp, tableMergeCellsOp, tableRemoveColumnOp, tableRemoveRowOp, tableSplitCellOp,
} from '../../core/table.js';
import { tableGrid } from '../../core/tableSpans.js';
import { clearCellSelection, selectedCellRange } from './cellSelection.js';
import { insertChartFromTable } from '../chart/index.js';
import { openContextMenu } from '../../ui/contextMenu.js';
import { t } from '../../i18n/index.js';

export function attachTableMenu(store: Store, host: HTMLElement, refreshBlock: (id: string) => void, actions: BlockMenuActions): void {
  host.addEventListener('contextmenu', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const cell = target.closest<HTMLElement>('td[data-row][data-column], th[data-row][data-column]');
    const blockEl = cell?.closest<HTMLElement>('.block-table');
    const blockId = blockEl?.dataset.id;
    if (!cell || !blockId) return;
    const row = Number(cell.dataset.row);
    const column = Number(cell.dataset.column);
    if (!Number.isInteger(row) || !Number.isInteger(column)) return;
    const block = store.doc.blocks.find((item) => item.id === blockId);
    if (!block || block.type !== 'table') return;
    const rows = block.meta?.rows ?? [];
    const columns = rows[0]?.length ?? 0;
    const range = selectedCellRange(host);
    const anchor = tableGrid(block).anchorAt(row, column);
    if (!store.selection.blockIds.includes(blockId)) store.setSelection(selectMany([blockId]));
    event.preventDefault();
    event.stopPropagation();

    const run = (op: (doc: typeof store.doc, id: string, at?: number) => ReturnType<typeof tableInsertRowOp> | null, at?: number): void => {
      store.dispatch(() => op(store.doc, blockId, at));
      refreshBlock(blockId);
    };

    openContextMenu([
      { label: t('在上方插入行'), onSelect: () => run(tableInsertRowOp, row) },
      { label: t('在下方插入行'), onSelect: () => run(tableInsertRowOp, row + 1) },
      { label: t('在左侧插入列'), onSelect: () => run(tableInsertColumnOp, column) },
      { label: t('在右侧插入列'), onSelect: () => run(tableInsertColumnOp, column + 1) },
      { separator: true, label: '' },
      { label: t('删除当前行'), disabled: rows.length <= 1, onSelect: () => run(tableRemoveRowOp, row) },
      { label: t('删除当前列'), disabled: columns <= 1, onSelect: () => run(tableRemoveColumnOp, column) },
      { separator: true, label: '' },
      {
        label: t('合并选中单元格'),
        disabled: !range || (range.top === range.bottom && range.left === range.right),
        onSelect: () => {
          if (!range) return;
          store.dispatch(() => tableMergeCellsOp(store.doc, blockId, range.top, range.left, range.bottom, range.right));
          refreshBlock(blockId);
          clearCellSelection(host);
        },
      },
      {
        label: t('生成图表'),
        disabled: rows.length < 2 || columns < 2,
        onSelect: () => { insertChartFromTable(store, blockId, 'bar'); },
      },
      {
        label: t('拆分单元格'),
        disabled: !anchor || (anchor.span.rowSpan === 1 && anchor.span.colSpan === 1),
        onSelect: () => {
          store.dispatch(() => tableSplitCellOp(store.doc, blockId, row, column));
          refreshBlock(blockId);
          clearCellSelection(host);
        },
      },
      ...blockActionItems(actions, true),
    ], event.clientX, event.clientY);
  });
}
