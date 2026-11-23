/** 图片编辑装配入口。 */

import type { Store } from '../../core/store.js';
import type { Toast } from '../../app/state.js';
import { selectOne } from '../../core/selection.js';
import { attachImageMenu } from './menu.js';
import { blockImageTarget } from './target.js';
import type { BlockMenuActions } from '../blocks/menu.js';

export interface ImageEditingDeps {
  store: Store;
  blocksHost: HTMLElement;
  toast: Toast;
  actions: BlockMenuActions;
}

export function installImageEditing({ store, blocksHost, toast, actions }: ImageEditingDeps): void {
  attachImageMenu({
    host: blocksHost,
    toast,
    resolveTarget: (element) => {
      const imageEl = element.closest<HTMLElement>('.block-image');
      const id = imageEl?.dataset.id;
      if (!id) return null;
      if (!store.selection.blockIds.includes(id)) store.setSelection(selectOne(id));
      return blockImageTarget(store, id);
    },
    actions,
  });
}
