/**
 * 注释控制器：块注释 / 组注释的唯一入口。
 * 编辑直接在注释行内进行，不再有独立编辑器节点和前后段拆分。
 */

import type { Store } from '../../core/store.js';
import type { CommentAnnotation } from '../../core/types.js';
import { groupRangeConflicts, isContiguousGroup, setCommentImageWidthOp } from '../../core/notes.js';
import { placeBlockExtensions } from '../../editor/extensions.js';
import { caretOffsetAt, selectionInLine } from './caret.js';
import { renderCommentLines } from './display.js';
import { attachCommentDrag } from './dragReorder.js';
import { InlineCommentEditor } from './inlineEditor.js';
import type { HighlightStyle } from '../../editor/highlight.js';
import { commentSlotOrder } from './layout.js';
import { createCommentDisplays } from './displayController.js';
import { groupTailId } from './model.js';
import { applyGroupMarks, clearGroupOverlay, paintGroupOverlay } from './overlay.js';
import { commentImageTarget } from './imageTarget.js';
import type { ImageTarget } from '../image/target.js';
import { attachCommentSelection } from './selection.js';
import { attachCommentBlankClick, attachCommentCopy } from './interaction.js';

export interface CommentsDeps {
  store: Store;
  blocksHost: HTMLElement;
  openImageMenu?: (target: ImageTarget, x: number, y: number) => void;
}

export interface CommentsManager {
  openBlock(blockId: string, noteId?: string | null): void;
  openGroup(blockIds: readonly string[], noteId?: string | null): void;
  openSelection(blockIds: readonly string[]): void;
  sync(): void;
  refreshSelection(): void;
  clearCommentSelection(): void;
  selectedCommentIds(): string[];
  consumeBlankClick(): boolean;
  layout(): void;
  close(): void;
  reset(): void;
  applyHighlight(style: HighlightStyle): boolean;
  applyColor(color: string): boolean;
  removeHighlight(): boolean;
}

export function createComments({ store, blocksHost, openImageMenu }: CommentsDeps): CommentsManager {
  const inline = new InlineCommentEditor();
  const blankClick = attachCommentBlankClick({ store, blocksHost, inline });
  attachCommentCopy();
  const commentSelection = attachCommentSelection(blocksHost, () => {
    if (store.selection.blockIds.length) store.setSelection({ blockIds: [], activeId: null });
  });

  const blockEl = (id: string): HTMLElement | null => blocksHost.querySelector<HTMLElement>(`.block[data-id="${id}"]`);

  const refreshSelection = (): void => {
    const selected = new Set(store.selection.blockIds);
    for (const [id, host] of blockDisplays) host.classList.toggle('is-block-selected', selected.has(id));
    for (const [id, host] of groupDisplays) host.classList.toggle('is-block-selected', selected.has(id));
    commentSelection.refresh();
  };

  const paintOverlay = (): void => {
    applyGroupMarks(blocksHost, store.doc, inline.activeGroupIds);
    paintGroupOverlay(blocksHost, store.doc, inline.activeGroupIds, inline.activeGroupColor ?? undefined);
  };

  const layout = (): void => {
    placeBlockExtensions(blocksHost);
    paintOverlay();
  };

  const createDisplay = (blockId: string, slot: 'block-comments' | 'group-comments'): HTMLElement => {
    const host = document.createElement('div');
    host.className = slot === 'group-comments'
      ? 'comment-display group-comment-display'
      : 'comment-display block-comment-display';
    host.dataset.blockId = blockId;
    host.dataset.commentUi = '1';
    host.dataset.commentSlot = slot;
    host.dataset.blockExtension = blockId;
    host.dataset.blockExtensionOrder = String(commentSlotOrder(slot));

    const lineOf = (target: EventTarget | null): HTMLElement | null =>
      target instanceof Element ? target.closest<HTMLElement>('.comment-line[data-comment-id]') : null;

    host.addEventListener('click', (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest('.comment-drag, .comment-inline-actions, .comment-image-resize')) return;
      const line = lineOf(target);
      const noteId = line?.dataset.commentId;
      if (!line || !noteId || line.classList.contains('is-editing')) return;
      commentSelection.select([noteId]);
      const caret = caretOffsetAt(line, event.clientX, event.clientY);
      const selection = selectionInLine(line);
      if (inline.isEditing) inline.save();
      sync();
      const note = store.doc.annotations.find((item) => item.type === 'comment' && item.id === noteId);
      if (!note || note.type !== 'comment') return;
      const isGroup = Boolean(note.anchor.blockIds?.length);
      const currentHost = isGroup ? groupDisplays.get(blockId) : blockDisplays.get(blockId);
      if (!currentHost) return;
      inline.start({
        store,
        host: currentHost,
        blockId,
        groupIds: note.anchor.blockIds ?? [],
        note,
        caret,
        selection,
        onDone: sync,
      });
    });

    host.addEventListener('pointerdown', (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const handle = target.closest<HTMLElement>('[data-comment-image-resize]');
      const line = handle?.closest<HTMLElement>('.comment-line[data-comment-id]');
      const wrap = handle?.closest<HTMLElement>('.comment-line-image-wrap');
      if (!handle || !line || !wrap) return;
      event.preventDefault();
      event.stopPropagation();
      const noteId = line.dataset.commentId;
      const index = Number(handle.dataset.commentImageResize);
      if (!noteId || !Number.isInteger(index)) return;
      const startX = event.clientX;
      const startPx = wrap.getBoundingClientRect().width;
      const linePx = Math.max(1, line.getBoundingClientRect().width);
      let width = Math.round((startPx / linePx) * 100);
      const move = (moveEvent: PointerEvent): void => {
        const nextPx = Math.min(linePx, Math.max(80, startPx + moveEvent.clientX - startX));
        width = Math.min(100, Math.max(10, Math.round((nextPx / linePx) * 100)));
        wrap.style.width = `${width}%`;
      };
      const finish = (): void => {
        document.removeEventListener('pointermove', move);
        document.removeEventListener('pointerup', finish);
        document.removeEventListener('pointercancel', finish);
        store.dispatch(() => setCommentImageWidthOp(store.doc, noteId, index, width));
      };
      document.addEventListener('pointermove', move);
      document.addEventListener('pointerup', finish);
      document.addEventListener('pointercancel', finish);
    });

    host.addEventListener('contextmenu', (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const wrap = target.closest<HTMLElement>('.comment-line-image-wrap');
      const line = wrap?.closest<HTMLElement>('.comment-line[data-comment-id]');
      if (!wrap || !line) return;
      const noteId = line.dataset.commentId;
      const index = Number(wrap.querySelector<HTMLElement>('[data-comment-image-resize]')?.dataset.commentImageResize);
      if (!noteId || !Number.isInteger(index)) return;
      const image = commentImageTarget(store, noteId, index);
      if (!image) return;
      event.preventDefault();
      event.stopPropagation();
      openImageMenu?.(image, event.clientX, event.clientY);
    });

    attachCommentDrag(host, store, () => inline.isEditing);
    blocksHost.appendChild(host);
    return host;
  };

  const displays = createCommentDisplays({
    store, blocksHost, inline, createHost: createDisplay, renderHost: renderCommentLines,
  });
  const { blockDisplays, groupDisplays } = displays;

  const ensureDraftHost = (blockId: string, groupIds: string[]): HTMLElement =>
    displays.ensureDraftHost(blockId, groupIds.length ? 'group-comments' : 'block-comments');

  const startDraft = (blockId: string, groupIds: string[]): void => {
    const host = ensureDraftHost(blockId, groupIds);
    // 新 host 默认追加在末尾；先放回组尾块，避免聚焦时滚到文档末尾。
    placeBlockExtensions(blocksHost);
    inline.start({
      store,
      host,
      blockId,
      groupIds,
      onDone: () => {
        sync();
        store.setSelection({ blockIds: [], activeId: null });
      },
    });
    paintOverlay();
  };

  const startNote = (blockId: string, note: CommentAnnotation): void => {
    commentSelection.select([note.id]);
    const isGroup = Boolean(note.anchor.blockIds?.length);
    const host = isGroup ? groupDisplays.get(blockId) : blockDisplays.get(blockId);
    if (!host) return;
    inline.start({ store, host, blockId, groupIds: note.anchor.blockIds ?? [], note, onDone: sync });
    paintOverlay();
  };

  const sync = (): void => {
    displays.sync();
    const noteId = inline.activeNoteId;
    if (noteId && !store.doc.annotations.some((annotation) => annotation.id === noteId)) {
      inline.cancel();
    }
    layout();
    refreshSelection();
  };

  window.addEventListener('resize', paintOverlay);

  const openBlock = (blockId: string, noteId: string | null = null): void => {
    if (!blockEl(blockId)) return;
    sync();
    if (noteId) {
      const note = store.doc.annotations.find(
        (item): item is CommentAnnotation => item.type === 'comment' && item.id === noteId,
      );
      if (note) startNote(blockId, note);
    } else {
      startDraft(blockId, []);
    }
  };

  const openGroup = (blockIds: readonly string[], noteId: string | null = null): void => {
    if (blockIds.length < 2) return;
    const tail = groupTailId(blockIds);
    if (!blockEl(tail)) return;
    sync();
    if (noteId) {
      const note = store.doc.annotations.find(
        (item): item is CommentAnnotation => item.type === 'comment' && item.id === noteId,
      );
      if (note) startNote(tail, note);
    } else {
      if (!isContiguousGroup(store.doc, blockIds)) return;
      if (groupRangeConflicts(store.doc, blockIds)) return;
      startDraft(tail, [...blockIds]);
    }
  };

  return {
    openBlock,
    openGroup,
    openSelection(blockIds: readonly string[]): void {
      if (!blockIds.length) return;
      if (blockIds.length === 1) {
        openBlock(blockIds[0], null);
        return;
      }
      const group = store.doc.groups.find((item) => blockIds.every((id) => item.blockIds.includes(id)));
      if (group) openGroup(group.blockIds, null);
      else openGroup(blockIds, null);
    },
    sync,
    refreshSelection,
    clearCommentSelection(): void {
      commentSelection.clear();
    },
    selectedCommentIds(): string[] {
      return commentSelection.ids();
    },
    consumeBlankClick(): boolean {
      return blankClick.consumeBlankClick();
    },
    layout,
    close(): void {
      inline.save();
    },
    applyHighlight(style: HighlightStyle): boolean {
      return inline.applyHighlight(style);
    },
    applyColor(color: string): boolean {
      return inline.applyColor(color);
    },
    removeHighlight(): boolean {
      return inline.removeHighlight();
    },
    reset(): void {
      inline.cancel();
      displays.reset();
      clearGroupOverlay(blocksHost);
    },
  };
}
