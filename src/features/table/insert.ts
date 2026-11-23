/** 表格插入：单个空段落原地替换，其余情况插到选中范围末尾。 */

import type { Store } from '../../core/store.js';
import { selectMany } from '../../core/selection.js';
import { createTableBlock } from '../../core/table.js';
import { createBlockInsertionPlan } from '../../core/blockInsertion.js';
import { preserveDocumentScroll } from '../../editor/scrollPolicy.js';

function focusFirstCell(blocksHost: HTMLElement, blockId: string, scrollTop: number): void {
  window.setTimeout(() => {
    const cell = blocksHost
      .querySelector<HTMLElement>(`.block[data-id="${blockId}"] .doc-table td, .block[data-id="${blockId}"] .doc-table th`);
    if (!cell) return;
    preserveDocumentScroll(blocksHost.closest<HTMLElement>('.workspace'), () => {
      cell.focus({ preventScroll: true });
    }, scrollTop);
  }, 0);
}

export function insertTable(
  store: Store,
  blocksHost: HTMLElement,
  rows: number,
  columns: number,
): boolean {
  const table = createTableBlock(rows, columns);
  const plan = createBlockInsertionPlan(store.doc, store.selection.blockIds, [table], []);
  if (!plan) return false;
  const beforeScroll = blocksHost.closest<HTMLElement>('.workspace')?.scrollTop ?? 0;
  const inserted = store.dispatch(() => plan.ops, selectMany(plan.selection));
  if (!inserted) return false;
  focusFirstCell(blocksHost, plan.selection[0], beforeScroll);
  return true;
}
