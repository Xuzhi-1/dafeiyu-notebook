/**
 * 工具栏 / 菜单项绑定 + 键盘快捷键。
 * 这里全是“按钮 → 动作”的接线，不实现业务逻辑。
 */

import { selectMany } from '../core/selection.js';
import { type Doc } from '../core/types.js';
import { loadLastFontFamily } from '../ui/fontPreference.js';
import { readTargetTextFormat } from '../ui/textFormatState.js';
import { resolveTextTarget } from '../editor/textTarget.js';
import { insertEmptyTextBlock } from '../editor/blockCreation.js';
import { installFontPicker } from '../ui/fontPicker.js';
import { t } from '../i18n/index.js';
import { tableAddRowOp } from '../core/table.js';
import { setBlockAlign, toggleInline } from '../editor/format.js';
import { nextTheme } from '../ui/theme.js';
import type { FileActions } from './files.js';
import type { ViewActions } from './view.js';
import type { Plugins } from './plugins.js';
import { flushDocumentEditing, redoDocument, undoDocument } from './editorCommands.js';
import { activeBlock, activeId, type AppState, type Toast } from './state.js';
import { installToolbarMark } from './toolbarMark.js';
import { installToolbarSize } from './toolbarSize.js';
import { installToolbarStyle } from './toolbarStyle.js';
import { installCommentPanel } from './commentPanel.js';


export interface ToolbarActions {
  moveActive(delta: number): void;
  duplicateActive(): void;
  deleteActive(): void;
  insertImage(): Promise<void>;
  adjustImageWidth(delta: number): void;
  resetImageWidth(): void;
  tableAction(run: (doc: Doc, id: string) => ReturnType<typeof tableAddRowOp>): void;
  markWithImage(): Promise<void>;
  applyTextStyle(style: { fontFamily?: string; fontSize?: string }, preserveSelection?: boolean): void;
  applyInlineLink(url: string, range?: Range | null): boolean;
  highlightSelection(): void;
  copySelection(): Promise<boolean>;
  cutSelection(): Promise<boolean>;
  copyText(): Promise<boolean>;
  cutText(): Promise<boolean>;
  pasteClipboard(): Promise<boolean>;
  pasteFromMenu(): Promise<boolean>;
  pastePlainText(): Promise<boolean>;
  deleteSelection(): void;
  clearSelection(): void;
}

export interface ToolbarDeps {
  state: AppState;
  files: FileActions;
  view: ViewActions;
  actions: ToolbarActions;
  plugins: Plugins;
  toast: Toast;
  refreshChrome: () => void;
}

export function installToolbar({ state, files, view, actions, plugins, toast }: ToolbarDeps): void {
  const { store } = state;
  let savedLinkRange: Range | null = null;
  let fontPicker: ReturnType<typeof installFontPicker> | null = null;

  const bind = (id: string, handler: () => void): void => {
    const button = document.querySelector<HTMLButtonElement>(`#${id}`);
    if (!button) return;
    button.addEventListener('mousedown', (event) => event.preventDefault());
    button.addEventListener('click', handler);
  };

  document.querySelector('#toolbar')?.addEventListener('pointerdown', () => flushDocumentEditing(state), true);

  /**
   * 正在编辑时，浏览器 caret 所在块才是用户真正想操作的目标。
   * 如果选区为空、或还停在上一块，就以 caret 块为准；多选则保留多选。
   */
  const caretBlockId = (): string | null => {
    const selection = window.getSelection();
    const node = selection?.anchorNode;
    if (node) {
      const el = node.nodeType === Node.ELEMENT_NODE ? node as Element : node.parentElement;
      const block = el?.closest<HTMLElement>('.block');
      if (block?.dataset.id) return block.dataset.id;
    }
    const active = document.activeElement;
    if (active instanceof Element) {
      const block = active.closest<HTMLElement>('.block');
      if (block?.dataset.id) return block.dataset.id;
    }
    return activeId(state);
  };

  const textBlockIds = (): string[] => {
    const selection = window.getSelection();
    if (!selection || !selection.rangeCount || selection.isCollapsed) return [];
    const range = selection.getRangeAt(0);
    return [...document.querySelectorAll<HTMLElement>('.block')]
      .filter((block) => range.intersectsNode(block))
      .map((block) => block.dataset.id)
      .filter((id): id is string => Boolean(id));
  };

  const actionIds = (): string[] => {
    const selected = state.store.selection.blockIds;
    if (selected.length) return [...selected];
    const caret = caretBlockId();
    if (caret) {
      state.store.setSelection(selectMany([caret]));
      return [caret];
    }
    return [];
  };

  const selectedFontFamily = (): string | null => {
    const format = readTargetTextFormat(resolveTextTarget(store), store);
    if (!format.hasText) return format.hasTextBlock ? loadLastFontFamily() : null;
    return format.fontFamily;
  };

  const refreshFontFamily = (): void => {
    const select = document.querySelector<HTMLSelectElement>('#font-family');
    if (!select || document.activeElement === select) return;
    const family = selectedFontFamily();
    if (family === null) {
      select.selectedIndex = -1;
      fontPicker?.sync();
      return;
    }
    const index = [...select.options].findIndex((option) => option.value === family);
    select.selectedIndex = index >= 0 ? index : -1;
    fontPicker?.sync();
  };

  const markTargets = (): string[] => {
    const textIds = textBlockIds();
    return textIds.length ? textIds : actionIds();
  };

  installToolbarStyle(state);

  installCommentPanel({ state, resolveTargets: actionIds });
  installToolbarMark({ state, resolveTargets: markTargets, markWithImage: actions.markWithImage });
  installToolbarSize({ state, applyTextStyle: actions.applyTextStyle });

  bind('btn-open', () => { void files.openDialog(); });
  bind('btn-new', () => { void files.newDocument(); });
  bind('btn-import', () => { void files.importText(); });
  bind('btn-associate', () => {
    if (!window.confirm(t('将 .dfy 文件默认用当前程序打开，并在右键新建中加入空白文档？'))) return;
    void window.moye?.registerFileAssociation?.().then((result) => {
      if (result?.ok) toast(t('已设置 .dfy 文件关联和右键新建'));
      else toast(t('设置文件关联失败：{error}', { error: result?.error ?? t('未知错误') }), 4000);
    });
  });
  bind('btn-print', () => { void files.printDocument(); });
  bind('btn-insert-image', () => { void actions.insertImage(); });
  bind('btn-zoom-in', () => view.applyZoom(state.zoom + 0.1));
  bind('btn-zoom-out', () => view.applyZoom(state.zoom - 0.1));
  bind('btn-link', () => {
    const selection = window.getSelection();
    savedLinkRange = selection?.rangeCount ? selection.getRangeAt(0).cloneRange() : null;
    const panel = document.querySelector<HTMLElement>('#link');
    if (panel) panel.hidden = !panel.hidden;
    const input = document.querySelector<HTMLInputElement>('#link-input');
    if (!panel?.hidden) input?.focus();
  });
  bind('btn-link-apply', () => {
    const input = document.querySelector<HTMLInputElement>('#link-input');
    if (input?.value.trim()) actions.applyInlineLink(input.value.trim(), savedLinkRange);
    savedLinkRange = null;
    const panel = document.querySelector<HTMLElement>('#link');
    if (panel) panel.hidden = true;
    if (input) input.value = '';
  });
  bind('btn-link-cancel', () => {
    savedLinkRange = null;
    const panel = document.querySelector<HTMLElement>('#link');
    if (panel) panel.hidden = true;
  });

  const linkInput = document.querySelector<HTMLInputElement>('#link-input');
  linkInput?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      document.querySelector<HTMLButtonElement>('#btn-link-apply')?.click();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      document.querySelector<HTMLButtonElement>('#btn-link-cancel')?.click();
    }
  });
  bind('btn-save', () => { void files.save(); });
  bind('btn-save-menu', () => { void files.save(); });
  bind('btn-save-as', () => { void files.saveAs(); });
  bind('btn-export-docx', () => { void files.exportDocx(); });
  bind('btn-export-pdf', () => { void files.exportPdf(); });
  bind('btn-theme', () => {
    const theme = nextTheme();
    const button = document.querySelector<HTMLElement>('#btn-theme');
    if (button) button.textContent = t('主题：{name}', { name: t(theme.name) });
  });

  bind('btn-add', () => {
    const current = activeBlock(state);
    const index = current
      ? store.doc.blocks.findIndex((block) => block.id === current.id) + 1
      : store.doc.blocks.length;
    insertEmptyTextBlock(store, index);
  });
  bind('btn-undo', () => undoDocument(state));
  bind('btn-redo', () => redoDocument(state));
  bind('btn-bold', () => toggleInline(store, 'bold'));
  bind('btn-italic', () => toggleInline(store, 'italic'));
  bind('btn-underline', () => toggleInline(store, 'underline'));
  bind('btn-strike', () => toggleInline(store, 'strikeThrough'));
  bind('btn-left', () => setBlockAlign(store, 'left'));
  bind('btn-center', () => setBlockAlign(store, 'center'));
  bind('btn-right', () => setBlockAlign(store, 'right'));
  bind('btn-justify', () => setBlockAlign(store, 'justify'));
  bind('btn-outline', () => view.toggleOutline());
  const fontSelect = document.querySelector<HTMLSelectElement>('#font-family');
  const fontButton = document.querySelector<HTMLButtonElement>('#font-family-button');
  const fontLabel = document.querySelector<HTMLElement>('#font-family-label');
  fontSelect?.addEventListener('change', () => {
    actions.applyTextStyle({ fontFamily: fontSelect.value }, true);
    // 空块不会产生文档变更事件，必须手动同步字体按钮。
    fontPicker?.sync();
  });
  if (fontSelect && fontButton && fontLabel) {
    fontPicker = installFontPicker(fontSelect, fontButton, fontLabel);
  }
  document.addEventListener('selectionchange', refreshFontFamily);
  window.addEventListener('dfy:font-options', refreshFontFamily);
  state.store.subscribe(refreshFontFamily);
  refreshFontFamily();
  bind('btn-check-update', () => {
    void window.moye?.openExternal?.('https://github.com/Xuzhi-1/dafeiyu-notebook/releases');
  });
  bind('btn-plugins', () => plugins.panel?.toggle());
  bind('btn-quit', () => window.moye?.windowControls?.close());
  bind('btn-reveal', () => {
    if (state.filePath) void window.moye?.showItemInFolder?.(state.filePath);
    else toast(t('文档还没有保存'));
  });

}
