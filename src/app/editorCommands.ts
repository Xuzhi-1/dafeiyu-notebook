/** 编辑器级命令：统一处理“先结束编辑，再执行文档操作”。 */

import type { AppState } from './state.js';
import { clearDocumentTextSelection } from '../editor/textSelection.js';

export function flushDocumentEditing(state: AppState): void {
  state.blocksHost.dispatchEvent(new CustomEvent('dfy:flush-editing'));
}

export function resetDocumentEditing(state: AppState): void {
  state.blocksHost.dispatchEvent(new CustomEvent('dfy:reset-editing'));
}

export function leaveEditing(state: AppState): void {
  flushDocumentEditing(state);
  const active = document.activeElement;
  if (active instanceof HTMLElement
    && (active.closest('.block-content') || active.closest('.doc-table td[contenteditable="true"], .doc-table th[contenteditable="true"]'))) {
    active.blur();
  }
}

export function leaveDocumentInteraction(state: AppState): void {
  leaveEditing(state);
  clearDocumentTextSelection();
  if (state.store.selection.blockIds.length || state.store.selection.activeId) {
    state.store.setSelection({ blockIds: [], activeId: null });
  }
}

export function undoDocument(state: AppState): void {
  leaveEditing(state);
  if (state.store.undoSelectionOnly()) return;
  state.store.undo();
}

export function redoDocument(state: AppState): void {
  leaveEditing(state);
  state.store.redo();
}
