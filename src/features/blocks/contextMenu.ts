import type { Store } from '../../core/store.js';
import { selectMany } from '../../core/selection.js';
import { openContextMenu, type ContextMenuItem } from '../../ui/contextMenu.js';
import { blockActionItems, type BlockMenuActions } from './menu.js';

interface BlockContextMenuDeps {
  store: Store;
  host: HTMLElement;
  actions: BlockMenuActions;
}

const TEXT_TYPES = new Set(['paragraph', 'quote', 'bullet', 'number']);

function validRange(content: HTMLElement, range: Range): boolean {
  if (!range.startContainer.isConnected || !range.endContainer.isConnected) return false;
  if (!content.contains(range.startContainer) || !content.contains(range.endContainer)) return false;
  if (range.startContainer === content && range.startOffset > content.childNodes.length) return false;
  if (range.endContainer === content && range.endOffset > content.childNodes.length) return false;
  return true;
}

function endRange(content: HTMLElement): Range {
  const range = document.createRange();
  range.selectNodeContents(content);
  range.collapse(false);
  return range;
}

function selectedRange(content: HTMLElement): Range | null {
  const selection = window.getSelection();
  if (!selection || !selection.rangeCount) return null;
  const range = selection.getRangeAt(0);
  return !range.collapsed && validRange(content, range) ? range.cloneRange() : null;
}

/** 没有文字光标时使用块末尾；有有效光标或选区时保持原位置。 */
function pasteAnchor(content: HTMLElement): Range {
  const selection = window.getSelection();
  const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
  if (range && validRange(content, range)) {
    if (document.activeElement === content || !range.collapsed) return range.cloneRange();
  }
  return endRange(content);
}

/** 块级右键菜单：文本块显示编辑菜单，其他块保留各自菜单。 */
export function installBlockContextMenu({ store, host, actions }: BlockContextMenuDeps): void {
  let rightClickSelection: { content: HTMLElement; range: Range } | null = null;

  host.addEventListener('pointerdown', (event) => {
    rightClickSelection = null;
    if (event.button !== 2) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    const blockEl = target.closest<HTMLElement>('.block');
    if (!blockEl) return;
    if (!target.closest('.block-handle, .comment-display, .block-actions')) {
      const content = blockEl.querySelector<HTMLElement>('.block-content');
      const range = content ? selectedRange(content) : null;
      if (content && range) rightClickSelection = { content, range };
    }
    if (target.closest('input, textarea, select, [contenteditable="true"], .doc-table')) {
      event.preventDefault();
    }
  }, true);

  host.addEventListener('contextmenu', (event) => {
    if (event.defaultPrevented) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (target.closest('input, textarea, select, .context-menu')) return;
    const blockEl = target.closest<HTMLElement>('.block');
    const blockId = blockEl?.dataset.id;
    const block = blockId ? store.doc.blocks.find((item) => item.id === blockId) : undefined;
    if (!blockEl || !blockId || !block) return;

    const selected = store.selection.blockIds;
    if (!selected.includes(blockId)) store.setSelection(selectMany([blockId]));

    const blocked = target.closest('.block-handle, .comment-display, .block-actions');
    const content = !blocked && TEXT_TYPES.has(block.type)
      ? (target.closest<HTMLElement>('.block-content') ?? blockEl.querySelector<HTMLElement>('.block-content'))
      : null;
    const items: ContextMenuItem[] = [];
    if (content && actions.pasteFromMenu && actions.pastePlainText) {
      const textSelection = selectedRange(content)
        ?? (rightClickSelection?.content === content && validRange(content, rightClickSelection.range)
          ? rightClickSelection.range.cloneRange()
          : null);
      const anchor = textSelection ?? pasteAnchor(content);
      rightClickSelection = null;
      const restoreText = (range: Range): boolean => {
        if (!content.isConnected || !validRange(content, range)) return false;
        content.focus({ preventScroll: true });
        const selection = window.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);
        return true;
      };
      if (actions.copyText && actions.cutText) {
        items.push(
          {
            label: '复制',
            disabled: !textSelection,
            onSelect: () => { if (textSelection && restoreText(textSelection)) void actions.copyText?.(); },
          },
          {
            label: '剪切',
            disabled: !textSelection,
            onSelect: () => { if (textSelection && restoreText(textSelection)) void actions.cutText?.(); },
          },
        );
      }
      items.push(
        {
          label: '粘贴',
          onSelect: () => {
            const target = validRange(content, anchor) ? anchor : endRange(content);
            if (restoreText(target)) void actions.pasteFromMenu?.(target.cloneRange());
          },
        },
        {
          label: '只粘贴文本',
          onSelect: () => {
            const target = validRange(content, anchor) ? anchor : endRange(content);
            if (restoreText(target)) void actions.pastePlainText?.(target.cloneRange());
          },
        },
        { separator: true, label: '' },
      );
    }
    items.push(...blockActionItems(actions));

    event.preventDefault();
    event.stopPropagation();
    openContextMenu(items, event.clientX, event.clientY);
  });
}
