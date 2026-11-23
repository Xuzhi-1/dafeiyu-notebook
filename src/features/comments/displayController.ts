/** 注释显示 host 的生命周期：只负责创建、复用和移除，不处理点击。 */

import type { Store } from '../../core/store.js';
import type { CommentAnnotation } from '../../core/types.js';
import { blockComments, commentDisplayIndex, groupCommentsAtTail } from './model.js';
import type { InlineCommentEditor } from './inlineEditor.js';

export type CommentSlot = 'block-comments' | 'group-comments';

export interface CommentDisplayDeps {
  store: Store;
  blocksHost: HTMLElement;
  inline: InlineCommentEditor;
  createHost(blockId: string, slot: CommentSlot): HTMLElement;
  renderHost(host: HTMLElement, notes: readonly CommentAnnotation[]): void;
}

export interface CommentDisplays {
  blockDisplays: Map<string, HTMLElement>;
  groupDisplays: Map<string, HTMLElement>;
  ensureDraftHost(blockId: string, slot: CommentSlot): HTMLElement;
  sync(): void;
  reset(): void;
}

export function createCommentDisplays({
  store, blocksHost, inline, createHost, renderHost,
}: CommentDisplayDeps): CommentDisplays {
  const blockDisplays = new Map<string, HTMLElement>();
  const groupDisplays = new Map<string, HTMLElement>();

  const ensureHost = (
    map: Map<string, HTMLElement>,
    blockId: string,
    notes: readonly CommentAnnotation[],
    slot: CommentSlot,
  ): void => {
    let existing = map.get(blockId);
    const block = blocksHost.querySelector<HTMLElement>(`.block[data-id="${blockId}"]`);
    if (!block) {
      if (existing && inline.isActive(existing)) inline.discardDetached();
      existing?.remove();
      map.delete(blockId);
      return;
    }
    if (existing && !existing.isConnected) {
      if (inline.isActive(existing)) inline.discardDetached();
      existing.remove();
      map.delete(blockId);
      existing = undefined;
    }
    if (existing && inline.isActive(existing)) return;
    if (!notes.length) {
      existing?.remove();
      map.delete(blockId);
      return;
    }
    let host = existing;
    if (!host) {
      host = createHost(blockId, slot);
      map.set(blockId, host);
    }
    renderHost(host, notes);
  };

  const ensureDraftHost = (blockId: string, slot: CommentSlot): HTMLElement => {
    const map = slot === 'group-comments' ? groupDisplays : blockDisplays;
    let host = map.get(blockId);
    if (!host) {
      host = createHost(blockId, slot);
      map.set(blockId, host);
    }
    return host;
  };

  const sync = (): void => {
    const ids = new Set([
      ...commentDisplayIndex(store.doc).keys(),
      ...blockDisplays.keys(),
      ...groupDisplays.keys(),
    ]);
    for (const blockId of ids) {
      ensureHost(blockDisplays, blockId, blockComments(store.doc, blockId), 'block-comments');
      ensureHost(groupDisplays, blockId, groupCommentsAtTail(store.doc, blockId), 'group-comments');
    }
    for (const [id, host] of [...blockDisplays]) {
      if (!blocksHost.querySelector<HTMLElement>(`.block[data-id="${id}"]`)) {
        host.remove();
        blockDisplays.delete(id);
      }
    }
    for (const [id, host] of [...groupDisplays]) {
      if (!blocksHost.querySelector<HTMLElement>(`.block[data-id="${id}"]`)) {
        host.remove();
        groupDisplays.delete(id);
      }
    }
  };

  return {
    blockDisplays,
    groupDisplays,
    ensureDraftHost,
    sync,
    reset(): void {
      for (const host of blockDisplays.values()) host.remove();
      blockDisplays.clear();
      for (const host of groupDisplays.values()) host.remove();
      groupDisplays.clear();
    },
  };
}

