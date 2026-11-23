/** 表格功能装配：工具栏入口、尺寸选择、单元格菜单。 */

import type { Store } from '../../core/store.js';
import type { BlockRenderer } from '../../editor/render.js';
import { insertTable } from './insert.js';
import { attachTableMenu } from './menu.js';
import { TablePicker } from './picker.js';
import { attachTableFocus } from './focus.js';
import { attachTableResize } from './resize.js';
import { attachTableCellSelection } from './cellSelection.js';
import type { BlockMenuActions } from '../blocks/menu.js';

export interface TableFeatureDeps {
  store: Store;
  blocksHost: HTMLElement;
  renderer: BlockRenderer;
  actions: BlockMenuActions;
}

export function installTableFeature({ store, blocksHost, renderer, actions }: TableFeatureDeps): void {
  const button = document.querySelector<HTMLElement>('#btn-table');
  if (!button) return;
  button.addEventListener('mousedown', (event) => event.preventDefault());

  const picker = new TablePicker(button, ({ rows, columns }) => {
    insertTable(store, blocksHost, rows, columns);
  });

  button.addEventListener('click', () => {
    if (!store.selection.blockIds.length) return;
    picker.toggle();
  });

  attachTableMenu(store, blocksHost, (id) => { renderer.refreshBlock(id); }, actions);
  attachTableResize(store, blocksHost);
  attachTableFocus(blocksHost);
  attachTableCellSelection(blocksHost);
}
