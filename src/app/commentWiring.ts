/**
 * 注释与区块渲染的接线：装饰图标、点击入口、文档变化后的注释刷新。
 */

import type { Block } from '../core/types.js';
import type { Store } from '../core/store.js';
import { selectMany } from '../core/selection.js';
import { altSelectionActive } from '../editor/altSelect.js';
import { decorateBlock } from '../editor/decorations.js';
import { markInfoForBlock } from '../core/notes.js';
import { blockComments, groupCommentsForBlock } from '../features/comments/model.js';
import { decorateComments } from '../features/comments/decorations.js';
import type { AppState } from './state.js';

export function createBlockDecorator(store: Store): (el: HTMLElement, block: Block) => void {
  return (el, block) => {
    const group = store.doc.groups.find((item) => item.blockIds.includes(block.id));
    const notes = blockComments(store.doc, block.id).length;
    el.classList.toggle('in-group', Boolean(group));
    const markInfo = markInfoForBlock(store.doc, block.id);
    decorateBlock(el, {
      mark: markInfo.badge,
      groupMark: markInfo.group,
      groupMarkHead: markInfo.groupHead,
      groupMarkTail: markInfo.groupTail,
    });
    decorateComments(el, { notes });
  };
}

export function installCommentClicks({ store, state }: { store: Store; state: AppState }): void {
  state.blocksHost.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    // Alt 选择模式只处理区块选择，注释不响应。
    if (altSelectionActive(event.altKey)) return;
    const blockEl = target.closest<HTMLElement>('.block');
    const id = blockEl?.dataset.id;
    if (!id) return;

    if (target.closest('[data-group-comment]')) {
      const annotations = groupCommentsForBlock(store.doc, id);
      const annotation = annotations.find((item) => item.anchor.blockIds?.[item.anchor.blockIds.length - 1] === id)
        ?? annotations[0];
      if (annotation?.anchor.blockIds) {
        state.comments.openGroup(annotation.anchor.blockIds, null);
        return;
      }
      const selected = store.selection.blockIds;
      if (selected.length > 1 && selected.includes(id)) state.comments.openGroup(selected);
      return;
    }

    if (!target.closest('[data-block-comment]')) return;
    store.setSelection(selectMany([id]));
    // 灰色图标默认是“新增注释”；编辑已有注释改为点注释文本。
    state.comments.openBlock(id, null);
  });
}

export function refreshCommentsAfterDoc(state: AppState, forceSync = false): void {
  const annotations = state.store.doc.annotations;
  if (forceSync || annotations !== state.lastAnnotations) {
    state.lastAnnotations = annotations;
    state.renderer.redecorateAll(state.store.doc.blocks);
    state.comments.sync();
    return;
  }
  state.comments.layout();
}
