/**
 * 编辑交互（阶段 4 起步）：
 * - 文本块使用 contenteditable，输入时“DOM 是事实来源”，停止输入后同步进模型；
 * - Enter 拆分段落、行首 Backspace 合并、基础快捷键（加粗/斜体/下划线）；
 * - 点击块设置选区（选区属于模型）。
 */

import { type Block } from '../core/types.js';
import type { Store } from '../core/store.js';
import { selectOne } from '../core/selection.js';
import { tableSetCellOp } from '../core/table.js';
import type { BlockRenderer } from './render.js';
import { sanitizeInline } from './sanitize.js';
import { contentTextLength, focusContentWithoutScroll, revealBlockOnInput } from './scrollPolicy.js';
import { plainText } from '../core/toc.js';
import { cssFontFamily, DEFAULT_FONT_FAMILY } from '../core/font.js';
import { loadLastFontFamily, loadLastFontSize } from '../ui/fontPreference.js';
import { createSplitTextBlock } from './blockCreation.js';
import { resolveTextTarget } from './textTarget.js';
import { readTargetTextFormat } from '../ui/textFormatState.js';

const SYNC_DELAY = 350;

function trimLeadingBreaks(root: HTMLElement): void {
  let node = root.firstChild;
  while (node) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node as Text;
      if (!text.data.trim()) {
        const next = node.nextSibling;
        text.remove();
        node = next;
        continue;
      }
      text.data = text.data.replace(/^[\r\n]+/, '');
      return;
    }
    if (node.nodeName === 'BR') {
      const next = node.nextSibling;
      (node as ChildNode).remove();
      node = next;
      continue;
    }
    return;
  }
}

function trimTrailingBreaks(root: HTMLElement): void {
  let node = root.lastChild;
  while (node) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node as Text;
      if (!text.data.trim()) {
        const previous = node.previousSibling;
        text.remove();
        node = previous;
        continue;
      }
      text.data = text.data.replace(/[\r\n]+$/, '');
      return;
    }
    if (node.nodeName === 'BR') {
      const previous = node.previousSibling;
      (node as ChildNode).remove();
      node = previous;
      continue;
    }
    return;
  }
}

export function attachEditing(store: Store, renderer: BlockRenderer, host: HTMLElement): () => void {
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  let composing = false;
  let revealFrame = 0;
  const textTypes = new Set(['paragraph', 'quote', 'bullet', 'number']);
  const pendingStyles = new Map<string, { fontFamily: string; fontSize: number }>();

  const previewEmptyFont = (el: HTMLElement): void => {
    const id = el.dataset.id;
    if (!id) return;
    const block = store.doc.blocks.find((item) => item.id === id);
    if (!block || !textTypes.has(block.type) || plainText(block.html).trim()) return;
    const content = contentOf(el);
    if (!content) return;
    const pending = pendingStyles.get(id);
    content.style.fontFamily = cssFontFamily(pending?.fontFamily || loadLastFontFamily() || DEFAULT_FONT_FAMILY);
    content.style.fontSize = `${pending?.fontSize ?? loadLastFontSize() ?? 16}px`;
  };

  const clearFontPreview = (el: HTMLElement): void => {
    const content = contentOf(el);
    if (!content) return;
    content.style.removeProperty('font-family');
    content.style.removeProperty('font-size');
  };

  const textPatch = (id: string, html: string): { html: string; fontFamily?: string; fontSize?: number } => {
    const block = store.doc.blocks.find((item) => item.id === id);
    const patch: { html: string; fontFamily?: string; fontSize?: number } = { html };
    if (block && textTypes.has(block.type) && !plainText(html).trim()) {
      patch.fontFamily = undefined;
      patch.fontSize = undefined;
    } else if (block && textTypes.has(block.type) && !plainText(block.html).trim() && plainText(html).trim()) {
      const pending = pendingStyles.get(id);
      patch.fontFamily = pending?.fontFamily || loadLastFontFamily() || DEFAULT_FONT_FAMILY;
      patch.fontSize = pending?.fontSize ?? loadLastFontSize() ?? 16;
      pendingStyles.delete(id);
    }
    return patch;
  };

  const revealBlock = (el: HTMLElement): void => {
    window.clearTimeout(revealFrame);
    revealFrame = window.setTimeout(() => {
      revealFrame = 0;
      revealBlockOnInput(host.closest<HTMLElement>('.workspace'), el);
    }, 0);
  };

  const blockOf = (target: EventTarget | null): HTMLElement | null => {
    const el = target instanceof Element ? target.closest<HTMLElement>('.block') : null;
    return el && host.contains(el) ? el : null;
  };

  const contentOf = (el: HTMLElement): HTMLElement | null => el.querySelector<HTMLElement>('.block-content');

  const syncBlock = (el: HTMLElement): void => {
    const id = el.dataset.id;
    const content = contentOf(el);
    if (!id || !content) return;
    const html = content.innerHTML;
    const existing = timers.get(id);
    if (existing) clearTimeout(existing);
    timers.set(id, setTimeout(() => {
      timers.delete(id);
      if (composing) return;
      store.dispatch((doc) => {
        const block = doc.blocks.find((item) => item.id === id);
        if (!block || block.html === html) return null;
        return [{ t: 'patchBlock', id, patch: textPatch(id, html) }];
      });
    }, SYNC_DELAY));
  };

  const onInput = (event: Event): void => {
    // 输入法组合期间不写模型：组合结束后统一同步一次（R19）
    if (composing) return;
    const target = event.target;
    if (target instanceof HTMLElement) {
      const cell = target.closest<HTMLElement>('td[data-row], th[data-row]');
      if (cell) {
        const blockEl = cell.closest<HTMLElement>('.block');
        const blockId = blockEl?.dataset.id;
        const row = Number(cell.dataset.row);
        const column = Number(cell.dataset.column);
        if (blockId && Number.isFinite(row) && Number.isFinite(column)) {
          const key = `${blockId}:cell`;
          const existing = timers.get(key);
          if (existing) clearTimeout(existing);
          timers.set(key, setTimeout(() => {
            timers.delete(key);
            if (composing) return;
            const block = store.doc.blocks.find((item) => item.id === blockId);
            const value = block?.meta?.richText ? sanitizeInline(cell.innerHTML) : cell.textContent ?? '';
            store.dispatch(() => tableSetCellOp(store.doc, blockId, row, column, value));
          }, SYNC_DELAY));
        }
        return;
      }
    }
    const el = blockOf(event.target);
    if (!el) return;
    previewEmptyFont(el);
    syncBlock(el);
    // 粘贴已经由粘贴路径负责滚动，不能再把整块 reveal 一次。
    const inputType = event instanceof InputEvent ? event.inputType : '';
    if (!inputType.startsWith('insertFromPaste')) revealBlock(el);
  };

  const onFocusIn = (event: FocusEvent): void => {
    const el = blockOf(event.target);
    if (el) previewEmptyFont(el);
  };

  const onCompositionStart = (): void => {
    composing = true;
  };

  const onCompositionEnd = (event: CompositionEvent): void => {
    composing = false;
    const target = event.target;
    if (target instanceof HTMLElement) {
      const cell = target.closest<HTMLElement>('td[data-row], th[data-row]');
      if (cell) {
        syncCellImmediate(cell);
        return;
      }
    }
    const el = blockOf(target);
    if (el) {
      syncBlock(el);
      revealBlock(el);
    }
  };

  /** 立刻把块内容写进模型（切换选中/失焦前调用） */
  const syncBlockImmediate = (el: HTMLElement): void => {
    const id = el.dataset.id;
    if (!id) return;
    const timer = timers.get(id);
    if (timer) clearTimeout(timer);
    timers.delete(id);
    const content = contentOf(el);
    if (!content) return;
    const html = content.innerHTML;
    store.dispatch((doc) => {
      const block = doc.blocks.find((item) => item.id === id);
      if (!block || block.html === html) return null;
      return [{ t: 'patchBlock', id, patch: textPatch(id, html) }];
    });
  };

  const syncCellImmediate = (cell: HTMLElement): void => {
    const blockEl = cell.closest<HTMLElement>('.block');
    const blockId = blockEl?.dataset.id;
    const row = Number(cell.dataset.row);
    const column = Number(cell.dataset.column);
    if (!blockId || !Number.isFinite(row) || !Number.isFinite(column)) return;
    const key = `${blockId}:cell`;
    const timer = timers.get(key);
    if (timer) clearTimeout(timer);
    timers.delete(key);
    const block = store.doc.blocks.find((item) => item.id === blockId);
    const value = block?.meta?.richText ? sanitizeInline(cell.innerHTML) : cell.textContent ?? '';
    store.dispatch(() => tableSetCellOp(store.doc, blockId, row, column, value));
  };

  const onFocusOut = (event: FocusEvent): void => {
    const target = event.target;
    if (target instanceof Element) {
      const cell = target.closest<HTMLElement>('td[data-row], th[data-row]');
      if (cell) {
        syncCellImmediate(cell);
        renderer.flushDeferred();
        return;
      }
    }
    const el = blockOf(event.target);
    if (el) {
      clearFontPreview(el);
      syncBlockImmediate(el);
    }
    renderer.flushDeferred();
  };

  const resetEditing = (): void => {
    for (const timer of timers.values()) clearTimeout(timer);
    timers.clear();
    pendingStyles.clear();
    composing = false;
    window.clearTimeout(revealFrame);
    revealFrame = 0;
  };

  const onFlush = (): void => {
    const active = document.activeElement;
    if (active instanceof HTMLElement) {
      const cell = active.closest<HTMLElement>('td[data-row], th[data-row]');
      if (cell) {
        syncCellImmediate(cell);
        return;
      }
      const el = blockOf(active);
      if (el) syncBlockImmediate(el);
    }
  };

  const atBlockStart = (content: HTMLElement): boolean => {
    const selection = window.getSelection();
    if (!selection || !selection.rangeCount) return false;
    const range = selection.getRangeAt(0);
    if (!content.contains(range.startContainer)) return false;
    const probe = range.cloneRange();
    probe.selectNodeContents(content);
    probe.setEnd(range.startContainer, range.startOffset);
    return probe.toString().length === 0;
  };

  const splitBlock = (el: HTMLElement, content: HTMLElement): void => {
    const id = el.dataset.id;
    if (!id) return;
    const selection = window.getSelection();
    if (!selection || !selection.rangeCount) return;
    const range = selection.getRangeAt(0);
    const format = readTargetTextFormat(resolveTextTarget(store), store);
    const tail = range.cloneRange();
    tail.selectNodeContents(content);
    tail.setStart(range.endContainer, range.endOffset);
    const holder = document.createElement('div');
    holder.appendChild(tail.extractContents());
    trimLeadingBreaks(holder);
    const afterHtml = holder.innerHTML;
    const before = content.cloneNode(true) as HTMLElement;
    trimTrailingBreaks(before);
    const beforeHtml = before.innerHTML;
    const sourceIndex = store.doc.blocks.findIndex((block) => block.id === id);
    const source = store.doc.blocks[sourceIndex];
    if (!source) return;
    const next: Block = createSplitTextBlock(source, afterHtml);
    if (plainText(source.html).trim() && !plainText(afterHtml).trim()) {
      pendingStyles.set(next.id, {
        fontFamily: format.fontFamily || source.fontFamily || DEFAULT_FONT_FAMILY,
        fontSize: format.fontSize ?? source.fontSize ?? 16,
      });
    }
    const beforeScroll = host.closest<HTMLElement>('.workspace')?.scrollTop ?? 0;

    store.dispatch((doc) => {
      const index = doc.blocks.findIndex((block) => block.id === id);
      if (index < 0) return null;
      return [
        { t: 'patchBlock', id, patch: { html: beforeHtml } },
        { t: 'insertBlocks', at: index + 1, blocks: [next] },
      ];
    }, { blockIds: [next.id], activeId: next.id });

    setTimeout(() => {
      const nextContent = host.querySelector<HTMLElement>(`.block[data-id="${next.id}"] .block-content`);
      if (nextContent) focusContentWithoutScroll(nextContent, { atEnd: false, offset: 0, scrollTop: beforeScroll });
    }, 0);
  };

  const mergeBack = (el: HTMLElement): boolean => {
    const id = el.dataset.id;
    if (!id) return false;
    const index = store.doc.blocks.findIndex((block) => block.id === id);
    if (index <= 0) return false;
    const previous = store.doc.blocks[index - 1];
    const current = store.doc.blocks[index];
    const mergedHtml = `${previous.html}${current.html}`;
    const previousNode = host.querySelector<HTMLElement>(`.block[data-id="${previous.id}"] .block-content`);
    const caret = previousNode ? contentTextLength(previousNode) : 0;
    const beforeScroll = host.closest<HTMLElement>('.workspace')?.scrollTop ?? 0;
    store.dispatch(() => [
      { t: 'patchBlock', id: previous.id, patch: { html: mergedHtml } },
      { t: 'removeBlocks', ids: [id] },
    ], selectOne(previous.id));
    setTimeout(() => {
      const previousContent = host.querySelector<HTMLElement>(`.block[data-id="${previous.id}"] .block-content`);
      if (previousContent) focusContentWithoutScroll(previousContent, { atEnd: false, offset: caret, scrollTop: beforeScroll });
    }, 0);
    return true;
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.isComposing) return;
    const el = blockOf(event.target);
    const content = el ? contentOf(el) : null;
    if (!el || !content) return;

    const mod = event.ctrlKey || event.metaKey;
    if (mod && !event.altKey) {
      const key = event.key.toLowerCase();
      if (key === 'b' || key === 'i' || key === 'u') {
        event.preventDefault();
        document.execCommand(key === 'b' ? 'bold' : key === 'i' ? 'italic' : 'underline');
        syncBlock(el);
        return;
      }
    }

    if (event.key === 'Enter' && !event.shiftKey && !mod) {
      event.preventDefault();
      splitBlock(el, content);
      return;
    }

    if (event.key === 'Backspace' && !mod) {
      const selection = window.getSelection();
      if (selection && !selection.isCollapsed) return;
      if (atBlockStart(content)) {
        if (mergeBack(el)) event.preventDefault();
      }
    }
  };

  host.addEventListener('input', onInput);
  host.addEventListener('focusin', onFocusIn);
  host.addEventListener('keydown', onKeyDown);
  host.addEventListener('focusout', onFocusOut);
  host.addEventListener('compositionstart', onCompositionStart);
  host.addEventListener('compositionend', onCompositionEnd);
  host.addEventListener('dfy:flush-editing', onFlush);
  host.addEventListener('dfy:reset-editing', resetEditing);

  return () => {
    host.removeEventListener('input', onInput);
    host.removeEventListener('focusin', onFocusIn);
    host.removeEventListener('keydown', onKeyDown);
    host.removeEventListener('focusout', onFocusOut);
    host.removeEventListener('compositionstart', onCompositionStart);
    host.removeEventListener('compositionend', onCompositionEnd);
    host.removeEventListener('dfy:flush-editing', onFlush);
    host.removeEventListener('dfy:reset-editing', resetEditing);
    for (const timer of timers.values()) clearTimeout(timer);
    timers.clear();
  };
}
