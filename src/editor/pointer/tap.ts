/**
 * 点击类手势：普通点击选单块、Alt 点击切换单块。Alt 不按整组处理。
 */

import { selectMany } from '../../core/selection.js';
import type { Store } from '../../core/store.js';
import { focusContentWithoutScroll } from '../scrollPolicy.js';
import { insertEmptyTextBlock } from '../blockCreation.js';

export function selectSingle(store: Store, id: string): void {
  store.setSelection(selectMany([id]));
}

/** Alt+点击：只切换当前块，不按整组处理。 */
export function toggleBlockSelection(store: Store, id: string): void {
  const selected = new Set(store.selection.blockIds);
  if (selected.has(id)) selected.delete(id);
  else selected.add(id);
  const blockIds = store.doc.blocks.map((block) => block.id).filter((blockId) => selected.has(blockId));
  store.setSelection({ blockIds, activeId: blockIds[blockIds.length - 1] ?? null });
}

export function focusBlockEnd(host: HTMLElement, blockId: string, scrollTop: number): void {
  window.setTimeout(() => {
    const content = host.querySelector<HTMLElement>(`.block[data-id="${blockId}"] .block-content`);
    if (!content) return;
    focusContentWithoutScroll(content, { atEnd: true, scrollTop });
  }, 0);
}

/** 点最后一块下方空白：新建空段落并聚焦。 */
export function insertParagraphAtEnd(store: Store, host: HTMLElement): boolean {
  const last = store.doc.blocks[store.doc.blocks.length - 1];
  if (!last) return false;
  const lastEl = host.querySelector<HTMLElement>(`.block[data-id="${last.id}"]`);
  if (!lastEl) return false;
  const beforeScroll = host.closest<HTMLElement>('.workspace')?.scrollTop ?? 0;
  const block = insertEmptyTextBlock(store, store.doc.blocks.length, true);
  focusBlockEnd(host, block.id, beforeScroll);
  return true;
}
