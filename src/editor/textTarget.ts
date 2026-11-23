/** 统一解析当前文字操作目标：文字选区、光标、块选区。 */

import type { Store } from '../core/store.js';

export type TextTargetKind = 'text' | 'caret' | 'block' | 'none';

export interface TextTarget {
  readonly kind: TextTargetKind;
  readonly blockIds: readonly string[];
  readonly activeBlockId: string | null;
  readonly range: Range | null;
  readonly caretElement: HTMLElement | null;
}

const TEXT_TYPES = new Set(['paragraph', 'quote', 'bullet', 'number']);

function lastTextNode(root: Node): Text | null {
  if (root.nodeType === Node.TEXT_NODE) return (root as Text).data ? root as Text : null;
  if (!(root instanceof Element)) return null;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let found: Text | null = null;
  let node = walker.nextNode();
  while (node) {
    if ((node as Text).data) found = node as Text;
    node = walker.nextNode();
  }
  return found;
}

export function characterBeforeCaret(range: Range): HTMLElement | null {
  const start = range.startContainer instanceof Element ? range.startContainer : range.startContainer.parentElement;
  const content = start?.closest<HTMLElement>('.block-content');
  if (!content) return null;
  if (range.startContainer.nodeType === Node.TEXT_NODE && range.startOffset > 0) {
    return (range.startContainer as Text).parentElement;
  }
  if (range.startContainer instanceof Element && range.startOffset > 0) {
    const text = lastTextNode(range.startContainer.childNodes[range.startOffset - 1]);
    if (text?.parentElement) return text.parentElement;
  }
  let current: Node | null = range.startContainer;
  while (current && current !== content) {
    let previous = current.previousSibling;
    while (previous) {
      const text = lastTextNode(previous);
      if (text?.parentElement) return text.parentElement;
      previous = previous.previousSibling;
    }
    current = current.parentNode;
  }
  return null;
}

/** 光标右侧第一个非空文本节点；用于块开头没有左侧字符时读取右侧格式。 */
function firstTextNode(root: Node): Text | null {
  if (root.nodeType === Node.TEXT_NODE) return (root as Text).data.trim() ? root as Text : null;
  if (!(root instanceof Element)) return null;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    if ((node as Text).data.trim()) return node as Text;
    node = walker.nextNode();
  }
  return null;
}

export function characterAfterCaret(range: Range): HTMLElement | null {
  const start = range.startContainer instanceof Element ? range.startContainer : range.startContainer.parentElement;
  const content = start?.closest<HTMLElement>('.block-content');
  if (!content) return null;
  if (range.startContainer.nodeType === Node.TEXT_NODE) {
    const text = range.startContainer as Text;
    if (text.data.slice(range.startOffset).trim()) return text.parentElement;
  } else if (range.startContainer instanceof Element) {
    for (let index = range.startOffset; index < range.startContainer.childNodes.length; index += 1) {
      const text = firstTextNode(range.startContainer.childNodes[index]);
      if (text?.parentElement) return text.parentElement;
    }
  }
  let current: Node | null = range.startContainer;
  while (current && current !== content) {
    let next = current.nextSibling;
    while (next) {
      const text = firstTextNode(next);
      if (text?.parentElement) return text.parentElement;
      next = next.nextSibling;
    }
    current = current.parentNode;
  }
  return null;
}

function isDocumentText(node: Node | null): boolean {
  const element = node instanceof Element ? node : node?.parentElement;
  return Boolean(element?.closest('.block-content, .doc-table td[contenteditable="true"], .doc-table th[contenteditable="true"]'));
}

function blockIdsInRange(range: Range): string[] {
  const ids: string[] = [];
  document.querySelectorAll<HTMLElement>('.block').forEach((el) => {
    if (el.dataset.id && range.intersectsNode(el)) ids.push(el.dataset.id);
  });
  return ids;
}

export function resolveTextTarget(store: Store): TextTarget {
  const selection = window.getSelection();
  const storedIds = store.selection.blockIds.length
    ? store.selection.blockIds
    : [store.selection.activeId].filter((id): id is string => Boolean(id));
  const textIds = storedIds.filter((id) => {
    const block = store.doc.blocks.find((item) => item.id === id);
    return Boolean(block && TEXT_TYPES.has(block.type));
  });
  const anchor = selection?.anchorNode instanceof Element
    ? selection.anchorNode
    : selection?.anchorNode?.parentElement;
  const anchorBlockId = anchor?.closest<HTMLElement>('.block')?.dataset.id ?? null;
  const activeBlockId = document.activeElement instanceof Element
    ? document.activeElement.closest<HTMLElement>('.block-content')?.closest<HTMLElement>('.block')?.dataset.id ?? null
    : null;

  if (selection?.rangeCount) {
    const range = selection.getRangeAt(0);
    const belongs = !storedIds.length
      || Boolean(activeBlockId && anchorBlockId === activeBlockId)
      || Boolean(anchorBlockId && storedIds.includes(anchorBlockId));
    if (!range.collapsed && belongs && isDocumentText(range.startContainer)) {
      const ids = blockIdsInRange(range);
      return {
        kind: 'text',
        blockIds: ids.length ? ids : anchorBlockId ? [anchorBlockId] : textIds,
        activeBlockId,
        range: range.cloneRange(),
        caretElement: null,
      };
    }
    if (range.collapsed && activeBlockId && anchorBlockId === activeBlockId) {
      return {
        kind: 'caret',
        blockIds: [anchorBlockId],
        activeBlockId,
        range: range.cloneRange(),
        caretElement: characterBeforeCaret(range) ?? characterAfterCaret(range),
      };
    }
  }

  if (textIds.length) {
    return { kind: 'block', blockIds: textIds, activeBlockId, range: null, caretElement: null };
  }
  return { kind: 'none', blockIds: [], activeBlockId, range: null, caretElement: null };
}
