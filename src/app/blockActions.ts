/**
 * 块级动作：移动/删除/图片/表格/标记/行内样式；剪贴板动作见 clipboardActions。
 * 只依赖 AppState 和 core，不碰工具栏 DOM。
 */

import {
  annotationsAfterClearingBlocks, annotationsForBlocks, defaultMark, markForBlock, setMarkOp,
} from '../core/notes.js';
import { selectMany } from '../core/selection.js';
import { tableAddRowOp } from '../core/table.js';
import { createBlock, type Block, type Doc } from '../core/types.js';
import type { Op } from '../core/ops.js';
import { applyOps } from '../core/ops.js';
import { applyInlineStyle, clearInlineFontOverrides, syncSelectionBlocks } from '../editor/format.js';
import { DEFAULT_FONT_FAMILY } from '../core/font.js';
import { emptyChart } from '../core/chart.js';
import { applyHighlight } from '../editor/highlight.js';
import { preserveDocumentScroll } from '../editor/scrollPolicy.js';
import { createBlockInsertionPlan } from '../core/blockInsertion.js';
import { DEFAULT_HIGHLIGHT_COLOR } from '../ui/colorDefaults.js';
import { saveLastFontFamily, saveLastFontSize } from '../ui/fontPreference.js';
import { plainText } from '../core/toc.js';
import { resolveTextTarget } from '../editor/textTarget.js';
import { platform } from '../platform/ipc.js';
import type { ToolbarActions } from './toolbar.js';
import { createClipboardActions } from './clipboardActions.js';
import { activeBlock, type AppState } from './state.js';

export function createBlockActions(state: AppState): ToolbarActions {
  const { store, renderer, blocksHost, workspace } = state;

  const moveActive = (delta: number): void => {
    const id = store.selection.activeId ?? store.selection.blockIds[0] ?? null;
    if (!id) return;
    const index = store.doc.blocks.findIndex((block) => block.id === id);
    if (index < 0) return;
    const at = Math.min(store.doc.blocks.length - 1, Math.max(0, index + delta));
    if (at === index) return;
    store.dispatch(() => [{ t: 'moveBlocks', ids: [id], at }]);
  };

  const duplicateActive = (): void => {
    const id = store.selection.activeId ?? store.selection.blockIds[0] ?? null;
    if (!id) return;
    const source = store.doc.blocks.find((block) => block.id === id);
    if (!source) return;
    const annotations = annotationsForBlocks(store.doc, [source.id]);
    const plan = createBlockInsertionPlan(store.doc, [source.id], [source], annotations);
    if (!plan) return;
    store.dispatch(() => plan.ops, selectMany(plan.selection));
  };

  const deleteSelection = (): void => {
    const ids = new Set(store.selection.blockIds);
    if (!ids.size) return;
    const index = store.doc.blocks.findIndex((block) => ids.has(block.id));
    const anchor = store.doc.blocks.slice(index).find((block) => !ids.has(block.id))
      ?? store.doc.blocks.slice(0, index).reverse().find((block) => !ids.has(block.id))
      ?? null;
    const beforeTop = anchor
      ? blocksHost.querySelector<HTMLElement>(`.block[data-id="${anchor.id}"]`)?.getBoundingClientRect().top ?? null
      : null;
    store.dispatch(() => [{ t: 'removeBlocks', ids: [...ids] }], { blockIds: [], activeId: null });
    if (anchor && beforeTop !== null) {
      const el = blocksHost.querySelector<HTMLElement>(`.block[data-id="${anchor.id}"]`);
      if (el) workspace.scrollTop += el.getBoundingClientRect().top - beforeTop;
    }
  };

  const clipboard = createClipboardActions(state, deleteSelection);

  const clearSelection = (): void => {
    const ids = [...new Set(store.selection.blockIds)];
    if (!ids.length) return;
    store.dispatch((doc) => {
      const removeIds = ids.filter((id) => (
        doc.blocks.find((block) => block.id === id)?.type === 'image'
      ));
      const removeSet = new Set(removeIds);
      const clearIds = ids.filter((id) => !removeSet.has(id));
      const afterRemoval = removeIds.length
        ? applyOps(doc, [{ t: 'removeBlocks', ids: removeIds }])
        : doc;
      const ops: Op[] = [];
      if (removeIds.length) ops.push({ t: 'removeBlocks', ids: removeIds });
      for (const id of clearIds) {
        const block = afterRemoval.blocks.find((item) => item.id === id);
        if (!block) continue;
        if (['paragraph', 'quote', 'bullet', 'number'].includes(block.type)) {
          if (block.html) ops.push({ t: 'patchBlock', id, patch: { html: '' } });
          continue;
        }
        if (block.type === 'table' && block.meta?.rows) {
          ops.push({
            t: 'patchBlock',
            id,
            patch: { meta: { ...block.meta, rows: block.meta.rows.map((row) => row.map(() => '')), caption: '' } },
          });
          continue;
        }
        if (block.type === 'chart') {
          ops.push({
            t: 'patchBlock',
            id,
            patch: { meta: { ...block.meta, chart: emptyChart(block.meta?.chart?.kind ?? 'bar') } },
          });
        }
      }
      const annotations = annotationsAfterClearingBlocks(afterRemoval, clearIds);
      if (annotations) ops.push({ t: 'patchDoc', patch: { annotations } });
      return ops.length ? ops : null;
    });
    for (const id of ids) renderer.refreshBlock(id);
  };

  const deleteActive = (): void => {
    const id = store.selection.activeId ?? store.selection.blockIds[0] ?? null;
    if (id) store.setSelection(selectMany([id]));
    deleteSelection();
  };

  const insertImage = async (): Promise<void> => {
    const api = platform();
    if (!api) return;
    const picked = await api.pickImage();
    if (!picked) return;
    const current = activeBlock(state);
    if (current?.type === 'image') {
      store.dispatch(() => [{ t: 'patchBlock', id: current.id, patch: { meta: { ...(current.meta ?? {}), src: picked.dataUrl } } }]);
      return;
    }
    const index = current ? store.doc.blocks.findIndex((block) => block.id === current.id) + 1 : store.doc.blocks.length;
    const block: Block = { ...createBlock('image'), meta: { src: picked.dataUrl, width: 100 } };
    store.dispatch((doc) => [{ t: 'insertBlocks', at: Math.min(index, doc.blocks.length), blocks: [block] }], selectMany([block.id]));
  };

  const adjustImageWidth = (delta: number): void => {
    const block = activeBlock(state);
    if (block?.type !== 'image') return;
    const width = Math.min(100, Math.max(10, (block.meta?.width ?? 100) + delta));
    store.dispatch(() => [{ t: 'patchBlock', id: block.id, patch: { meta: { ...(block.meta ?? {}), width } } }]);
  };

  const resetImageWidth = (): void => {
    const block = activeBlock(state);
    if (block?.type !== 'image') return;
    store.dispatch(() => [{ t: 'patchBlock', id: block.id, patch: { meta: { ...(block.meta ?? {}), width: 100 } } }]);
  };

  const tableAction = (run: (doc: Doc, id: string) => ReturnType<typeof tableAddRowOp>): void => {
    const id = store.selection.activeId ?? store.selection.blockIds[0] ?? null;
    if (!id) return;
    store.dispatch(() => run(store.doc, id));
  };

  const markWithImage = async (): Promise<void> => {
    const api = platform();
    const block = activeBlock(state);
    if (!api || !block) return;
    const picked = await api.pickImage();
    if (!picked) return;
    const mark = { ...(markForBlock(store.doc, block.id) ?? defaultMark('mark')), image: picked.dataUrl };
    if (store.dispatch(() => setMarkOp(store.doc, [block.id], mark))) {
      store.setSelection({ blockIds: [], activeId: null });
    }
  };

  const applyInlineLink = (url: string, savedRange: Range | null = null): boolean => {
    const href = /^(https?:\/\/|mailto:)/i.test(url) ? url : `https://${url}`;
    const range = savedRange?.cloneRange()
      ?? (window.getSelection()?.rangeCount ? window.getSelection()!.getRangeAt(0).cloneRange() : null);
    if (!range) return false;
    const start = range.startContainer;
    const startEl = start instanceof Element ? start : start.parentElement;
    const content = startEl?.closest<HTMLElement>('[contenteditable="true"], [contenteditable="plaintext-only"]');
    if (!content) return false;

    preserveDocumentScroll(workspace, () => {
      content.focus({ preventScroll: true });
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      if (range.collapsed) {
        const anchor = document.createElement('a');
        anchor.href = href;
        anchor.textContent = href;
        range.insertNode(anchor);
        range.setStartAfter(anchor);
        range.collapse(true);
        selection?.removeAllRanges();
        selection?.addRange(range);
      } else {
        document.execCommand('createLink', false, href);
      }
      syncSelectionBlocks(store);
    });
    return true;
  };

  const applyTextStyle = (style: { fontFamily?: string; fontSize?: string }, preserveSelection = false): void => {
    const target = resolveTextTarget(store);
    if (style.fontFamily !== undefined) saveLastFontFamily(style.fontFamily);
    if (style.fontSize) {
      const size = Number.parseFloat(style.fontSize);
      if (Number.isFinite(size)) saveLastFontSize(size);
    }
    if (target.kind === 'text' && target.range) {
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(target.range);
      applyInlineStyle(store, style.fontFamily === undefined
        ? style
        : { ...style, fontFamily: style.fontFamily || DEFAULT_FONT_FAMILY }, preserveSelection);
      return;
    }
    const patch: { fontFamily?: string; fontSize?: number } = {};
    if (style.fontFamily !== undefined) patch.fontFamily = style.fontFamily || DEFAULT_FONT_FAMILY;
    if (style.fontSize) patch.fontSize = Number.parseFloat(style.fontSize);
    if (!target.blockIds.length || !Object.keys(patch).length) return;
    const textTypes = new Set(['paragraph', 'quote', 'bullet', 'number']);
    const properties = [
      ...(patch.fontFamily !== undefined ? ['font-family'] : []),
      ...(patch.fontSize !== undefined ? ['font-size'] : []),
    ];
    const updates = new Map<string, string>();
    for (const id of target.blockIds) {
      const block = store.doc.blocks.find((item) => item.id === id);
      if (!block || !textTypes.has(block.type) || !plainText(block.html)) continue;
      const content = blocksHost.querySelector<HTMLElement>(`.block[data-id="${CSS.escape(id)}"] .block-content`);
      if (!content) continue;
      clearInlineFontOverrides(content, properties);
      updates.set(id, content.innerHTML);
    }
    store.dispatch((doc) => target.blockIds.flatMap((id) => {
      const block = doc.blocks.find((item) => item.id === id);
      if (!block || !textTypes.has(block.type) || !plainText(block.html)) return [];
      const nextPatch = updates.has(id) ? { ...patch, html: updates.get(id) } : patch;
      return [{ t: 'patchBlock' as const, id, patch: nextPatch }];
    }));
  };

  const highlightSelection = (): void => {
    applyHighlight(store, { mode: 'marker', color: DEFAULT_HIGHLIGHT_COLOR });
  };

  return {
    moveActive,
    duplicateActive,
    deleteActive,
    insertImage,
    adjustImageWidth,
    resetImageWidth,
    tableAction,
    markWithImage,
    applyTextStyle,
    applyInlineLink,
    highlightSelection,
    ...clipboard,
    deleteSelection,
    clearSelection,
  };
}
