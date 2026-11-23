/**
 * 行内注释编辑器：直接编辑 comment-line-text，不再用 textarea。
 */

import type { Store } from '../../core/store.js';
import { t } from '../../i18n/index.js';
import type { CommentAnnotation } from '../../core/types.js';
import {
  addInlineImageNote, inlineCommentColor, removeInlineNote, saveInlineNote,
} from './inlineEditorActions.js';
import { commentToHtml, sanitizeCommentHtml, trimCommentBoundary } from './sanitizeComment.js';
import { applyHighlightToRange, removeHighlightInRange, type HighlightStyle } from '../../editor/highlight.js';
import { applyInlineStyleToRange } from '../../editor/format.js';
import { createActionBar, createDraftLine, ensureLineText } from './inlineEditorDom.js';
import { attachCommentPaste } from './inlineEditorPaste.js';
import { attachInlineKeyboard } from './inlineEditorKeyboard.js';

export interface InlineStartOptions {
  store: Store;
  host: HTMLElement;
  blockId: string;
  groupIds: readonly string[];
  note?: CommentAnnotation;
  caret?: number | null;
  selection?: { start: number; end: number } | null;
  onDone?: () => void;
}

interface InlineState {
  store: Store;
  host: HTMLElement;
  line: HTMLElement;
  text: HTMLElement;
  actions: HTMLElement;
  draft: boolean;
  noteId: string | null;
  originalHtml: string;
  initialHtml: string;
  originalFormat: boolean;
  blockId: string;
  groupIds: string[];
  detach: (() => void)[];
  onDone?: () => void;
}

export class InlineCommentEditor {
  private state: InlineState | null = null;

  start(options: InlineStartOptions): void {
    this.cancel();
    const { store, host, blockId, groupIds, note, caret, selection } = options;
    const isGroup = groupIds.length > 0;
    const color = note?.color || inlineCommentColor();
    let line: HTMLElement;
    let draft = false;

    if (note) {
      const found = host.querySelector<HTMLElement>(`.comment-line[data-comment-id="${note.id}"]`);
      if (!found) return;
      line = found;
    } else {
      draft = true;
      line = createDraftLine(host, color, isGroup);
    }

    line.classList.add('is-editing');
    line.style.setProperty('--comment-color', color);
    const text = ensureLineText(line);
    if (draft) text.dataset.placeholder = isGroup ? t('输入组注释…') : t('输入注释…');
    text.innerHTML = note ? commentToHtml(note.html, note.format === 'html') : '';
    const initialHtml = text.innerHTML;
    text.setAttribute('contenteditable', 'true');
    text.spellcheck = false;

    const actions = createActionBar();
    line.insertAdjacentElement('afterend', actions);
    const detach: (() => void)[] = [];

    this.state = {
      store,
      host,
      line,
      text,
      actions,
      draft,
      noteId: note?.id ?? null,
      originalHtml: note?.html ?? '',
      initialHtml,
      originalFormat: note?.format === 'html',
      blockId,
      groupIds: [...groupIds],
      detach,
      onDone: options.onDone,
    };

    const start = selection?.start ?? caret ?? text.textContent.length;
    const end = selection?.end ?? start;
    // 注释编辑器接管焦点后，不能再让原区块保持选中。
    this.state.store.setSelection({ blockIds: [], activeId: null });
    this.focusAt(text, start, end);

    actions.addEventListener('mousedown', (event) => event.preventDefault());
    actions.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest('[data-note-close]')) {
        this.cancel();
        return;
      }
      if (target.closest('[data-note-delete]')) {
        this.remove();
        return;
      }
      if (target.closest('[data-note-add]')) {
        this.save();
        return;
      }
      if (target.closest('[data-note-image]')) {
        void this.insertImage();
      }
    });

    detach.push(attachCommentPaste(text));
    detach.push(attachInlineKeyboard(text, {
      save: () => this.save(),
      cancel: () => this.cancel(),
      isDraft: () => Boolean(this.state?.draft),
      isDirty: () => {
        const state = this.state;
        return state ? trimCommentBoundary(sanitizeCommentHtml(state.text.innerHTML))
          !== trimCommentBoundary(sanitizeCommentHtml(state.initialHtml)) : false;
      },
    }));
  }

  private focusAt(text: HTMLElement, start: number, end = start): void {
    text.focus();
    const nodes: { node: Text; start: number }[] = [];
    const walker = document.createTreeWalker(text, NodeFilter.SHOW_TEXT);
    let full = '';
    let node = walker.nextNode() as Text | null;
    while (node) {
      nodes.push({ node, start: full.length });
      full += node.data;
      node = walker.nextNode() as Text | null;
    }
    const pointAt = (offset: number): { node: Text; offset: number } | null => {
      const target = nodes.find((item) => offset <= item.start + item.node.data.length);
      return target ? { node: target.node, offset: offset - target.start } : null;
    };
    const from = Math.min(full.length, Math.max(0, Math.min(start, end)));
    const to = Math.min(full.length, Math.max(0, Math.max(start, end)));
    const range = document.createRange();
    const startPoint = pointAt(from);
    const endPoint = pointAt(to);
    if (startPoint && endPoint) {
      range.setStart(startPoint.node, startPoint.offset);
      range.setEnd(endPoint.node, endPoint.offset);
    } else {
      range.selectNodeContents(text);
      range.collapse(false);
    }
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  }

  applyHighlight(style: HighlightStyle): boolean {
    const state = this.state;
    if (!state) return false;
    const selection = window.getSelection();
    if (!selection || !selection.rangeCount || selection.isCollapsed) return false;
    const range = selection.getRangeAt(0);
    if (!state.text.contains(range.startContainer) || !state.text.contains(range.endContainer)) return false;
    const span = applyHighlightToRange(range, style);
    if (!span) return false;
    const next = document.createRange();
    next.selectNodeContents(span);
    selection.removeAllRanges();
    selection.addRange(next);
    return true;
  }

  applyColor(color: string): boolean {
    const state = this.state;
    if (!state) return false;
    const selection = window.getSelection();
    if (!selection || !selection.rangeCount || selection.isCollapsed) return false;
    const range = selection.getRangeAt(0);
    if (!state.text.contains(range.startContainer) || !state.text.contains(range.endContainer)) return false;
    const span = applyInlineStyleToRange(range, { color });
    if (!span) return false;
    const next = document.createRange();
    next.selectNodeContents(span);
    selection.removeAllRanges();
    selection.addRange(next);
    return true;
  }

  removeHighlight(): boolean {
    const state = this.state;
    if (!state) return false;
    const selection = window.getSelection();
    if (!selection || !selection.rangeCount) return false;
    const range = selection.getRangeAt(0);
    if (!state.text.contains(range.startContainer) || !state.text.contains(range.endContainer)) return false;
    if (!range.collapsed) {
      const caret = range.cloneRange();
      caret.collapse(false);
      if (!removeHighlightInRange(range)) return false;
      selection.removeAllRanges();
      selection.addRange(caret);
      return true;
    }
    // 光标在高亮内时删掉该段；否则删除整条注释里的高亮。
    const element = range.startContainer instanceof Element
      ? range.startContainer
      : range.startContainer.parentElement;
    const atCaret = element?.closest<HTMLElement>('[data-highlight]');
    const spans = atCaret && state.text.contains(atCaret)
      ? [atCaret]
      : [...state.text.querySelectorAll<HTMLElement>('[data-highlight]')];
    if (!spans.length) return false;
    for (const span of spans) span.replaceWith(...span.childNodes);
    return true;
  }

  private cleanup(): InlineState | null {
    const state = this.state;
    if (!state) return null;
    this.state = null;
    for (const off of state.detach.splice(0)) off();
    state.actions.remove();
    state.text.removeAttribute('contenteditable');
    state.text.spellcheck = false;
    state.line.classList.remove('is-editing', 'comment-draft');
    state.text.removeAttribute('data-placeholder');
    if (state.draft) state.line.remove();
    return state;
  }

  save(): void {
    const state = this.state;
    if (!state) return;
    const html = trimCommentBoundary(sanitizeCommentHtml(state.text.innerHTML));
    const { store, blockId, groupIds, noteId, originalHtml, onDone } = state;
    this.cleanup();
    saveInlineNote({ store, blockId, groupIds, noteId, originalHtml, format: 'html' }, html);
    onDone?.();
  }

  cancel(): void {
    const state = this.state;
    if (!state) return;
    const { text, originalHtml, originalFormat, onDone } = state;
    this.cleanup();
    if (!state.draft) text.innerHTML = commentToHtml(originalHtml, originalFormat);
    onDone?.();
  }

  remove(): void {
    const state = this.state;
    if (!state) return;
    const { store, noteId, onDone } = state;
    this.cleanup();
    removeInlineNote(store, noteId);
    onDone?.();
  }

  /** 宿主 DOM 已被替换时只清理编辑器，不触发重新同步。 */
  discardDetached(): void {
    if (this.state) this.cleanup();
  }

  private async insertImage(): Promise<void> {
    const state = this.state;
    if (!state) return;
    const picked = await window.moye?.pickImage?.();
    if (!picked) return;
    const { store, groupIds, blockId } = state;
    this.save();
    addInlineImageNote(store, blockId, groupIds, picked.dataUrl);
  }

  isActive(host: HTMLElement): boolean {
    return this.state?.host === host;
  }

  get isEditing(): boolean {
    return this.state !== null;
  }

  get activeNoteId(): string | null {
    return this.state?.noteId ?? null;
  }

  get activeGroupIds(): string[] {
    return this.state?.groupIds ?? [];
  }

  get activeGroupColor(): string | null {
    const state = this.state;
    return state && state.groupIds.length
      ? state.line.style.getPropertyValue('--comment-color') || null
      : null;
  }
}
