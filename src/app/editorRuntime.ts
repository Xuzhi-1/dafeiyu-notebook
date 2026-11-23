/**
 * 编辑器运行时接线：store 订阅、首次渲染、输入/粘贴/指针层、注释点击。
 */

import { addEntryAt, tocOp, type TocDropTarget } from '../core/toc.js';
import { selectMany } from '../core/selection.js';
import { installAltSelection } from '../editor/altSelect.js';
import { IMAGE_WIDTH_EVENT, type ImageWidthDetail } from '../editor/blocks/image.js';
import { attachEditing } from '../editor/editing.js';
import { attachPaste } from '../editor/paste.js';
import { attachPointerLayer } from '../editor/pointer/router.js';
import { paintGroupMarkOverlay } from '../features/marks/overlay.js';
import { installRightDragPan } from '../features/interaction/rightDragPan.js';
import { installSideMarquee } from '../features/interaction/sideMarquee.js';
import { installCommentClicks, refreshCommentsAfterDoc } from './commentWiring.js';
import { leaveDocumentInteraction } from './editorCommands.js';
import { lastBlockExtensionBounds } from '../features/comments/geometry.js';
import type { Toast } from './state.js';
import type { AppState } from './state.js';

export interface EditorRuntimeDeps {
  state: AppState;
  refreshChrome: () => void;
  toast: Toast;
}

export function installEditorRuntime({ state, refreshChrome, toast }: EditorRuntimeDeps): void {
  const { store, renderer, blocksHost, outlineView } = state;
  installAltSelection({
    shouldSuppress: () => Boolean(document.activeElement?.closest('.comment-line.is-editing')),
  });

  blocksHost.addEventListener(IMAGE_WIDTH_EVENT, (event) => {
    const detail = (event as CustomEvent<ImageWidthDetail>).detail;
    if (!detail?.id) return;
    const block = store.doc.blocks.find((item) => item.id === detail.id);
    if (!block || block.type !== 'image') return;
    const width = Math.min(100, Math.max(10, Math.round(detail.width)));
    if (block.meta?.width === width) return;
    store.dispatch(() => [{
      t: 'patchBlock',
      id: block.id,
      patch: { meta: { ...(block.meta ?? {}), width } },
    }]);
  });

  store.subscribe((event) => {
    if (event.type === 'doc' || event.type === 'patch') {
      state.outlineView.render(store.doc);
      state.searchPanel?.refresh();
    }
    if (event.type === 'patch') {
      state.dirty = true;
      state.lastStats = renderer.updateBlocks(store.doc, event.ids);
      refreshCommentsAfterDoc(state);
      paintGroupMarkOverlay(blocksHost, store.doc);
      refreshChrome();
      return;
    }
    if (event.type === 'doc') {
      state.dirty = true;
      state.lastStats = renderer.render(store.doc);
      if (store.doc.groups !== state.lastGroups) {
        state.lastGroups = store.doc.groups;
        renderer.redecorateAll(store.doc.blocks);
      }
      refreshCommentsAfterDoc(state, true);
      paintGroupMarkOverlay(blocksHost, store.doc);
      refreshChrome();
      return;
    }
    renderer.applySelection(event.selection.blockIds);
    state.comments.refreshSelection();
    refreshChrome();
  });

  installCommentClicks({ store, state });
  installRightDragPan(state.workspace);
  installSideMarquee(store, state.workspace);

  state.workspace.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (target.closest('.block, [data-comment-ui], #outline, .toolbar, #font-panel, #comment-panel, #mark-panel, .table-picker, .size-popover, .style-panel, #link, #search, button, input, textarea, select')) return;
    // 文档区空白由指针层决定：先点击新建块时，不能提前清空选区。
    if (state.blocksHost.contains(target)) return;
    leaveDocumentInteraction(state);
  });

  store.setSelection(selectMany(['b2']));
  state.lastStats = renderer.render(store.doc);
  renderer.applySelection(store.selection.blockIds);
  outlineView.render(store.doc);
  refreshChrome();
  state.comments.sync();
  paintGroupMarkOverlay(blocksHost, store.doc);

  let markOverlayFrame = 0;
  const paintMarkOverlay = (): void => {
    markOverlayFrame = 0;
    paintGroupMarkOverlay(blocksHost, store.doc);
  };
  const scheduleMarkOverlay = (): void => {
    if (markOverlayFrame) return;
    markOverlayFrame = requestAnimationFrame(paintMarkOverlay);
  };
  window.addEventListener('resize', scheduleMarkOverlay);
  if (typeof ResizeObserver !== 'undefined') {
    new ResizeObserver(scheduleMarkOverlay).observe(blocksHost);
  }

  attachEditing(store, renderer, blocksHost);
  attachPaste(blocksHost);
  attachPointerLayer(store, blocksHost, {
    consumeCommentCommit: () => state.comments.consumeBlankClick(),
    extensionBounds: (blockId) => lastBlockExtensionBounds(blocksHost, blockId),
    onDropToOutline: (ids, target: TocDropTarget | null) => {
      if (!ids.length) return;
      const entries = addEntryAt(store.doc, ids, target);
      if (!entries) return;
      store.dispatch(() => tocOp(entries));
      if (target) toast('已加入目录');
    },
  });
}
