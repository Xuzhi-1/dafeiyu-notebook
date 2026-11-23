/** 全局快捷键：正文/目录/输入框分上下文处理，不负责工具栏绑定。 */

import { selectMany } from '../core/selection.js';
import type { MenuController } from '../ui/menus.js';
import type { AppState } from './state.js';
import type { FileActions } from './files.js';
import { leaveDocumentInteraction, redoDocument, undoDocument } from './editorCommands.js';

export interface ShortcutActions {
  copySelection(): Promise<boolean>;
  cutSelection(): Promise<boolean>;
  pasteClipboard(): Promise<boolean>;
  deleteSelection(): void;
}

export interface ShortcutDeps {
  state: AppState;
  files: FileActions;
  actions: ShortcutActions;
  menus: MenuController;
}

export function installShortcuts({ state, files, actions, menus }: ShortcutDeps): void {
  const { store } = state;
  let lastRegion: 'outline' | 'editor' | 'other' = 'other';

  document.addEventListener('pointerdown', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    lastRegion = target.closest('#outline')
      ? 'outline'
      : target.closest('#blocks, #workspace')
        ? 'editor'
        : 'other';
  }, true);

  const editingContent = (): HTMLElement | null => {
    const active = document.activeElement;
    if (active instanceof Element) {
      const content = active.closest<HTMLElement>('.block-content');
      if (content) return content;
    }
    return null;
  };

  const selectBlockText = (content: HTMLElement): void => {
    const selection = window.getSelection();
    if (!selection) return;
    const range = document.createRange();
    range.selectNodeContents(content);
    selection.removeAllRanges();
    selection.addRange(range);
  };

  const selectAllBlocks = (): void => {
    const ids = store.doc.blocks.map((block) => block.id);
    if (!ids.length) return;
    window.getSelection()?.removeAllRanges();
    state.outlineView.clear();
    state.comments.clearCommentSelection();
    store.setSelection(selectMany(ids));
  };

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Backspace' && event.key !== 'Delete') return;
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const target = event.target;
    if (target instanceof Element
      && target.closest('input, textarea, select, [contenteditable="true"], .table-picker, .size-popover, #mark-panel, #comment-panel, .style-panel, #link, #search')) return;
    if (target instanceof Element && target.closest('.block-content')) return;
    if (editingContent()) return;
    if (!store.selection.blockIds.length) return;
    event.preventDefault();
    actions.deleteSelection();
  });

  document.addEventListener('keydown', (event) => {
    if (!(event.ctrlKey || event.metaKey)) return;
    const key = event.key.toLowerCase();
    const target = event.target instanceof Element ? event.target : null;
    const active = document.activeElement;
    const editing = active instanceof HTMLElement && Boolean(active.closest('.block-content, .doc-table'));
    const multi = store.selection.blockIds.length > 1;
    const textInput = target?.closest('input, textarea, select')
      ?? (active instanceof Element ? active.closest('input, textarea, select') : null);
    const editable = target?.closest('[contenteditable="true"]')
      ?? (active instanceof Element ? active.closest('[contenteditable="true"]') : null);
    const panel = target?.closest('.table-picker, .size-popover, #mark-panel, #comment-panel, .style-panel, #link, #search');

    if (key === 'a') {
      if (textInput) return;
      if (editable?.closest('.doc-table')) return;
      if (target?.closest('.comment-line-text')) return;
      if (active instanceof Element && active.closest('.comment-line-text')) return;
      if (lastRegion === 'outline' && !target?.closest('.block-content')) {
        event.preventDefault();
        window.getSelection()?.removeAllRanges();
        store.setSelection({ blockIds: [], activeId: null });
        state.outlineView.selectAll();
        return;
      }
      const content = target?.closest<HTMLElement>('.block-content') ?? editingContent();
      if (content) {
        event.preventDefault();
        selectBlockText(content);
        return;
      }
      if (lastRegion === 'editor' || target?.closest('#blocks, #workspace')) {
        event.preventDefault();
        selectAllBlocks();
        return;
      }
      // 工具栏/面板等非编辑区域不让浏览器全选整个应用。
      event.preventDefault();
      return;
    }

    if (key === 'c' || key === 'x' || key === 'v') {
      if (textInput || panel) return;
      if (editable && !editing) return;
      if (key !== 'v' && editing && !multi) return;
      if (key === 'v') {
        if (editing) return;
        event.preventDefault();
        void actions.pasteClipboard();
        return;
      }
      if (!store.selection.blockIds.length) return;
      event.preventDefault();
      void (key === 'c' ? actions.copySelection() : actions.cutSelection());
      return;
    }

    if (key === 's') { event.preventDefault(); void (event.shiftKey ? files.saveAs() : files.save()); return; }
    if (key === 'o') { event.preventDefault(); void files.openDialog(); return; }
    if (key === 'z' && !event.shiftKey) {
      if (textInput) return;
      event.preventDefault();
      undoDocument(state);
    }
    if (key === 'y' || (key === 'z' && event.shiftKey)) {
      if (textInput) return;
      event.preventDefault();
      redoDocument(state);
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    if (menus.isOpen()) {
      menus.close();
      return;
    }
    const active = document.activeElement;
    if (active instanceof Element && active.closest('input, textarea, select, .comment-line-text')) return;
    leaveDocumentInteraction(state);
  });
}
