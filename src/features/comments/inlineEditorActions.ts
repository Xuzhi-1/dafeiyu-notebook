/** 行内注释的写操作：保存、删除、追加图片。 */

import { addNoteOp, removeNoteOp, updateNoteOp } from '../../core/notes.js';
import type { Store } from '../../core/store.js';
import { loadCommentColor } from '../../storage/appearance.js';

export interface InlineNoteTarget {
  store: Store;
  blockId: string;
  groupIds: readonly string[];
  noteId: string | null;
  originalHtml: string;
  format?: 'html';
}

export function inlineCommentColor(): string {
  return loadCommentColor();
}

function clearGroupSelection(store: Store, groupIds: readonly string[]): void {
  if (groupIds.length > 1) store.setSelection({ blockIds: [], activeId: null });
}

export function saveInlineNote(target: InlineNoteTarget, text: string): void {
  const { store, blockId, groupIds, noteId, originalHtml, format } = target;
  if (noteId) {
    if (text !== originalHtml) {
      store.dispatch(() => updateNoteOp(store.doc, noteId, text, { format }));
    }
    return;
  }
  if (!text) return;
  const anchorBlockId = groupIds[0] ?? blockId;
  const added = store.dispatch(() => addNoteOp(
    store.doc,
    anchorBlockId,
    text,
    groupIds,
    [],
    { color: inlineCommentColor(), format },
  ));
  if (added) clearGroupSelection(store, groupIds);
}

export function removeInlineNote(store: Store, noteId: string | null): void {
  if (noteId) store.dispatch(() => removeNoteOp(store.doc, noteId));
}

export function addInlineImageNote(
  store: Store,
  blockId: string,
  groupIds: readonly string[],
  dataUrl: string,
): void {
  const anchorBlockId = groupIds[0] ?? blockId;
  const added = store.dispatch(() => addNoteOp(
    store.doc,
    anchorBlockId,
    '',
    groupIds,
    [dataUrl],
    { color: inlineCommentColor() },
  ));
  if (added) clearGroupSelection(store, groupIds);
}
