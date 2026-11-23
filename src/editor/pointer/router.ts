/**
 * 块级指针层唯一入口。
 *
 * 命中优先级：
 *   1. .block-handle → 块拖拽
 *   2. Alt + .block  → 选中/整组切换
 *   3. .block-content → 交给浏览器处理光标/文本选择（click 时只同步块选区）
 *   4. 空白           → 框选；轻点空白可新建块
 *
 * 同一时间只允许一个手势；结束时统一清理；Esc 取消当前手势。
 */

import type { Store } from '../../core/store.js';
import type { TocDropTarget } from '../../core/toc.js';
import { altSelectionActive } from '../altSelect.js';
import { startBlockDrag } from './blockDrag.js';
import { startMarquee } from './marquee.js';
import { clearOutlineMarks, setBodyDragging } from './overlay.js';
import { insertParagraphAtEnd, selectSingle, toggleBlockSelection } from './tap.js';
import { clearDocumentTextSelection } from '../textSelection.js';
import type { Gesture } from './types.js';

export interface PointerLayerOptions {
  onDropToOutline?: (ids: string[], target: TocDropTarget | null) => void;
  consumeCommentCommit?: () => boolean;
  extensionBounds?: (blockId: string) => { top: number; bottom: number } | null;
  extensionBuffer?: number;
}

type GestureKind = 'marquee' | 'block-drag';

export function attachPointerLayer(
  store: Store,
  host: HTMLElement,
  options: PointerLayerOptions = {},
): () => void {
  host.style.position = 'relative';
  let active: { gesture: Gesture; kind: GestureKind; pointerId: number } | null = null;
  let suppressClick = false;
  let suppressTimer = 0;

  const suppressNextClick = (): void => {
    suppressClick = true;
    clearTimeout(suppressTimer);
    suppressTimer = window.setTimeout(() => { suppressClick = false; }, 0);
  };

  const removeDocumentListeners = (): void => {
    document.removeEventListener('pointermove', onMove);
    document.removeEventListener('pointerup', onUp);
    document.removeEventListener('pointercancel', onCancel);
  };

  const endGesture = (): Gesture | null => {
    const current = active;
    active = null;
    removeDocumentListeners();
    if (current) {
      try { host.releasePointerCapture(current.pointerId); } catch { /* ignore */ }
    }
    return current?.gesture ?? null;
  };

  const onMove = (event: PointerEvent): void => {
    active?.gesture.move(event);
  };

  const onUp = (event: PointerEvent): void => {
    const current = active;
    const gesture = endGesture();
    if (!current || !gesture) return;
    gesture.finish(event);
    if (current.kind === 'block-drag' || gesture.moved()) suppressNextClick();
  };

  const onCancel = (): void => {
    const gesture = endGesture();
    gesture?.cancel();
    setBodyDragging(false);
    clearOutlineMarks(document.querySelector<HTMLElement>('#outline'));
    suppressNextClick();
  };

  const begin = (gesture: Gesture, kind: GestureKind, event: PointerEvent): void => {
    active = { gesture, kind, pointerId: event.pointerId };
    try { host.setPointerCapture(event.pointerId); } catch { /* ignore */ }
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
    document.addEventListener('pointercancel', onCancel);
  };

  const clearEditing = (): void => {
    host.dispatchEvent(new CustomEvent('dfy:flush-editing'));
    clearDocumentTextSelection();
    const active = document.activeElement;
    if (active instanceof HTMLElement) {
      if (active.closest('.block-content, .doc-table, #titlebar-search, #search')) active.blur();
    }
  };

  const onPointerDown = (event: PointerEvent): void => {
    if (event.button !== 0) return;
    if (active) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    // 每次新的点击都从干净选区开始：Shift+点击也只选择区块，不做原生文本扩选。
    if (!target.closest('.block')) window.getSelection()?.removeAllRanges();
    const alt = altSelectionActive(event.altKey);
    const block = target.closest<HTMLElement>('.block');

    // Alt 选择模式：从区块内按下也可拖动框选；没有拖动时仍然只切换当前块。
    if (block && alt) {
      event.preventDefault();
      event.stopPropagation();
      clearEditing();
      const id = block.dataset.id;
      const gesture = startMarquee({ store, host, options }, event, {
        deferSelection: true,
        onTap: () => {
          if (id) toggleBlockSelection(store, id);
          suppressNextClick();
        },
      });
      begin(gesture, 'marquee', event);
      return;
    }

    if (target.closest('[data-comment-ui]')) return;

    const selectBlockOnly = (event.ctrlKey || event.metaKey) && block;
    if (selectBlockOnly) {
      event.preventDefault();
      event.stopPropagation();
      clearEditing();
      if (store.selection.blockIds.length < 2 && block.dataset.id) selectSingle(store, block.dataset.id);
      suppressNextClick();
      return;
    }

    const handle = target.closest<HTMLElement>('.block-handle');
    if (handle) {
      event.preventDefault();
      event.stopPropagation();
      clearEditing();
      const gesture = startBlockDrag({ store, host, options }, event, handle);
      if (gesture) begin(gesture, 'block-drag', event);
      return;
    }

    if (block) {
      if (!target.closest('.block-content, .doc-table')) clearEditing();
      if (event.shiftKey) {
        event.preventDefault();
        return;
      }
      const id = block.dataset.id;
      const current = store.selection;
      if (id && !(current.blockIds.length === 1 && current.blockIds[0] === id && current.activeId === id)) {
        selectSingle(store, id);
      }
      return;
    }

    event.preventDefault();
    clearEditing();
    begin(startMarquee({ store, host, options }, event, { deferSelection: true }), 'marquee', event);
  };

  const textSelectionInBlock = (): boolean => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !selection.rangeCount) return false;
    const node = selection.getRangeAt(0).startContainer;
    const element = node instanceof Element ? node : node.parentElement;
    return Boolean(element?.closest('.block-content, .doc-table'));
  };

  const onClick = (event: MouseEvent): void => {
    if (suppressClick) {
      suppressClick = false;
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (event.altKey) return;
    if (textSelectionInBlock()) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (target.closest('[data-comment-ui]')) return;

    const afterCommentCommit = options.consumeCommentCommit?.() ?? false;
    const block = target.closest<HTMLElement>('.block');
    const id = block?.dataset.id;
    if (id) {
      selectSingle(store, id);
      return;
    }
    // 刚保存注释的这次点击只负责关闭注释，不能按空白点击清空选区。
    if (afterCommentCommit) return;

    const last = store.doc.blocks[store.doc.blocks.length - 1];
    if (!last) return;
    const lastEl = host.querySelector<HTMLElement>(`.block[data-id="${last.id}"]`);
    if (!lastEl) return;
    const lastBottom = lastEl.getBoundingClientRect().bottom;
    const extension = options.extensionBounds?.(last.id) ?? null;
    if (extension) {
      // 扩展区域及其下方缓冲带不作为“正文末尾空白”。
      if (event.clientY >= extension.top - 1
        && event.clientY <= extension.bottom + (options.extensionBuffer ?? 12)) return;
    } else if (event.clientY < lastBottom - 1) {
      store.setSelection({ blockIds: [], activeId: null });
      return;
    }
    insertParagraphAtEnd(store, host);
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape' && active) {
      event.preventDefault();
      event.stopPropagation();
      onCancel();
    }
  };

  const onFocusIn = (event: FocusEvent): void => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (target.closest('[data-comment-ui]')) return;
    const block = target.closest<HTMLElement>('.block');
    const id = block?.dataset.id;
    if (!id) return;
    if (store.selection.blockIds.length) return;
    selectSingle(store, id);
  };

  host.addEventListener('pointerdown', onPointerDown);
  host.addEventListener('click', onClick);
  host.addEventListener('focusin', onFocusIn);
  document.addEventListener('keydown', onKeyDown, true);

  return () => {
    host.removeEventListener('pointerdown', onPointerDown);
    host.removeEventListener('click', onClick);
    host.removeEventListener('focusin', onFocusIn);
    document.removeEventListener('keydown', onKeyDown, true);
    const gesture = endGesture();
    gesture?.cancel();
    setBodyDragging(false);
    clearOutlineMarks(document.querySelector<HTMLElement>('#outline'));
    clearTimeout(suppressTimer);
  };
}
