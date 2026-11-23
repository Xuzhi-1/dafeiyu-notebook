/** 剪贴板动作：块复制、文字复制、菜单粘贴与纯文本粘贴。 */

import { annotationsForBlocks } from '../core/notes.js';
import { selectMany } from '../core/selection.js';
import { decodeBlockClipboard, encodeBlockClipboard } from '../core/blockClipboard.js';
import { createBlockInsertionPlan } from '../core/blockInsertion.js';
import {
  captureScrollAnchor, holdDocumentScroll, restoreScrollAnchor, stabilizeDocumentScroll,
} from '../editor/scrollPolicy.js';
import { syncSelectionBlocks } from '../editor/format.js';
import { insertPlainPaste, insertRichPaste, plainPasteFormat } from '../editor/paste.js';
import { platform } from '../platform/ipc.js';
import { selectionBlocks, type AppState } from './state.js';

export interface ClipboardActions {
  copySelection(): Promise<boolean>;
  cutSelection(): Promise<boolean>;
  copyText(): Promise<boolean>;
  cutText(): Promise<boolean>;
  pasteClipboard(): Promise<boolean>;
  pasteFromMenu(range?: Range | null): Promise<boolean>;
  pastePlainText(range?: Range | null): Promise<boolean>;
}

export function createClipboardActions(state: AppState, deleteSelection: () => void): ClipboardActions {
  const { store, blocksHost } = state;
  let copyInFlight: Promise<boolean> | null = null;

  const copySelection = async (): Promise<boolean> => {
    const api = platform();
    const blocks = selectionBlocks(state);
    if (!api || !blocks.length) return false;
    const annotations = annotationsForBlocks(store.doc, blocks.map((block) => block.id))
      .map((annotation) => ({ ...annotation }));
    const content = encodeBlockClipboard(blocks, annotations);
    const task = api.writeBlockClipboard(content.text, content.html);
    copyInFlight = task;
    try {
      return await task;
    } finally {
      if (copyInFlight === task) copyInFlight = null;
    }
  };

  const cutSelection = async (): Promise<boolean> => {
    if (!await copySelection()) return false;
    deleteSelection();
    return true;
  };

  const selectedText = (): { range: Range; text: string; html: string } | null => {
    const selection = window.getSelection();
    if (!selection || !selection.rangeCount || selection.isCollapsed) return null;
    const range = selection.getRangeAt(0);
    const start = range.startContainer instanceof Element ? range.startContainer : range.startContainer.parentElement;
    if (!start?.closest('.block-content')) return null;
    const text = selection.toString();
    if (!text) return null;
    const holder = document.createElement('div');
    holder.appendChild(range.cloneContents());
    return { range, text, html: holder.innerHTML };
  };

  const copyText = async (): Promise<boolean> => {
    const api = platform();
    const selected = selectedText();
    if (!api || !selected) return false;
    return api.writeBlockClipboard(selected.text, selected.html);
  };

  const cutText = async (): Promise<boolean> => {
    const api = platform();
    const selected = selectedText();
    if (!api || !selected || !await api.writeBlockClipboard(selected.text, selected.html)) return false;
    if (!selected.range.startContainer.isConnected) return true;
    const content = (selected.range.startContainer instanceof Element
      ? selected.range.startContainer
      : selected.range.startContainer.parentElement)?.closest<HTMLElement>('.block-content');
    if (!content) return false;
    content.focus({ preventScroll: true });
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(selected.range);
    selected.range.deleteContents();
    selected.range.collapse(true);
    selection?.removeAllRanges();
    selection?.addRange(selected.range);
    syncSelectionBlocks(store);
    return true;
  };

  const currentRange = (): Range | null => {
    const selection = window.getSelection();
    return selection?.rangeCount ? selection.getRangeAt(0).cloneRange() : null;
  };

  const restoreRange = (range: Range | null): boolean => {
    if (!range || !range.startContainer.isConnected || !range.endContainer.isConnected) return false;
    const start = range.startContainer instanceof Element ? range.startContainer : range.startContainer.parentElement;
    const content = start?.closest<HTMLElement>('.block-content');
    if (!content) return false;
    content.focus({ preventScroll: true });
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    return true;
  };

  const pastePayload = (payload: NonNullable<ReturnType<typeof decodeBlockClipboard>>): boolean => {
    const plan = createBlockInsertionPlan(
      store.doc,
      store.selection.blockIds,
      payload.blocks,
      payload.annotations,
    );
    if (!plan) return false;
    const workspace = blocksHost.closest<HTMLElement>('.workspace');
    const target = store.doc.blocks.filter((block) => store.selection.blockIds.includes(block.id)).pop();
    const anchor = captureScrollAnchor(workspace, target?.id ?? null);
    store.dispatch(() => plan.ops, selectMany(plan.selection));
    restoreScrollAnchor(workspace, anchor ? { blockId: plan.anchorId, offset: anchor.offset } : null);
    return true;
  };

  const pasteBlockHtml = (html: string): boolean => {
    const payload = decodeBlockClipboard(html);
    return payload ? pastePayload(payload) : false;
  };

  const pasteClipboard = async (): Promise<boolean> => {
    const api = platform();
    if (!api) return false;
    const pending = copyInFlight;
    if (pending) await pending;
    return pasteBlockHtml(await api.readClipboardHtml());
  };

  const pasteFromMenu = async (range?: Range | null): Promise<boolean> => {
    const api = platform();
    if (!api) return false;
    const target = (range ?? currentRange())?.cloneRange() ?? null;
    const pending = copyInFlight;
    if (pending) await pending;
    const html = await api.readClipboardHtml();
    if (pasteBlockHtml(html)) return true;
    if (!target) return false;
    const text = await api.readClipboardText();
    if (!restoreRange(target) || !insertRichPaste(html, text)) return false;
    syncSelectionBlocks(store);
    return true;
  };

  const pastePlainText = async (range?: Range | null): Promise<boolean> => {
    const api = platform();
    if (!api) return false;
    const target = (range ?? currentRange())?.cloneRange() ?? null;
    if (!target) return false;
    const format = plainPasteFormat(target);
    const text = await api.readClipboardText();
    if (!restoreRange(target) || !insertPlainPaste(text, format)) return false;
    syncSelectionBlocks(store);
    return true;
  };

  blocksHost.addEventListener('paste', (event) => {
    const target = event.target;
    if (!(target instanceof Element) || !target.closest('.block-content, .doc-table')) return;
    if (copyInFlight) {
      event.preventDefault();
      const pending = copyInFlight;
      void pending.then(() => pasteClipboard());
      return;
    }
    const workspace = blocksHost.closest<HTMLElement>('.workspace');
    const scrollTop = workspace?.scrollTop ?? 0;
    const payload = decodeBlockClipboard(event.clipboardData?.getData('text/html') ?? '');
    if (!payload) {
      // 浏览器原生粘贴仍会移动光标，粘贴结束后恢复视口位置。
      holdDocumentScroll(workspace);
      stabilizeDocumentScroll(workspace, scrollTop);
      return;
    }
    event.preventDefault();
    pastePayload(payload);
  }, true);

  return {
    copySelection, cutSelection, copyText, cutText,
    pasteClipboard, pasteFromMenu, pastePlainText,
  };
}
