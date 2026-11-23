/** 注释外观面板：颜色选择、持久化、图标同步。 */

import { removeNotesOp, setCommentColorByIdsOp, setCommentColorOp } from '../core/notes.js';
import { addColorToPalette, syncColorPalette } from '../ui/colorPalette.js';
import { openColorPicker } from '../ui/mark/colorPicker.js';
import { loadCommentColor, saveCommentColor } from '../storage/appearance.js';
import { openColorPanel } from '../ui/colorPanel.js';
import type { AppState } from './state.js';

const DEFAULT_COLOR = '#4d6bfe';

export function installCommentPanel({ state, resolveTargets }: {
  state: AppState;
  resolveTargets: () => string[];
}): void {
  const { store, comments } = state;
  let targets: string[] = [];
  let selectedCommentIds: string[] = [];

  const bind = (id: string, handler: () => void): void => {
    const button = document.querySelector<HTMLButtonElement>(`#${id}`);
    if (!button) return;
    button.addEventListener('mousedown', (event) => event.preventDefault());
    button.addEventListener('click', handler);
  };

  const closePanel = (): void => {
    const panel = document.querySelector<HTMLElement>('#comment-panel');
    if (panel) panel.hidden = true;
    targets = [];
    selectedCommentIds = [];
  };

  const refreshIcon = (color?: string): void => {
    const icon = document.querySelector<HTMLElement>('#btn-comment .tb-ic');
    const input = document.querySelector<HTMLInputElement>('#comment-color');
    if (icon) icon.style.color = color || input?.value || loadCommentColor();
  };

  const openPanel = (): void => {
    const color = openColorPanel({
      panelId: 'comment-panel',
      inputId: 'comment-color',
      anchorId: 'btn-comment',
      caretId: 'btn-comment-more',
    });
    if (!color) return;
    color.value = loadCommentColor();
    syncColorPalette('comment-color');
  };

  const input = document.querySelector<HTMLInputElement>('#comment-color');
  if (input) input.value = loadCommentColor();
  syncColorPalette('comment-color');
  refreshIcon();
  input?.addEventListener('input', () => refreshIcon());

  bind('btn-comment', () => { comments.openSelection(resolveTargets()); });

  document.addEventListener('dfy:comment-panel-dismissed', () => {
    const color = document.querySelector<HTMLInputElement>('#comment-color')?.value || loadCommentColor();
    saveCommentColor(color);
    refreshIcon(color);
    targets = [];
    selectedCommentIds = [];
  });

  bind('btn-comment-more', () => {
    const panel = document.querySelector<HTMLElement>('#comment-panel');
    if (panel && !panel.hidden) {
      closePanel();
      document.dispatchEvent(new CustomEvent('dfy:comment-panel-dismissed'));
      return;
    }
    selectedCommentIds = comments.selectedCommentIds();
    targets = resolveTargets();
    openPanel();
  });

  bind('comment-color-btn', () => {
    const button = document.querySelector<HTMLElement>('#comment-color-btn');
    const colorInput = document.querySelector<HTMLInputElement>('#comment-color');
    if (!button || !colorInput) return;
    openColorPicker({
      anchor: button,
      color: colorInput.value || loadCommentColor(),
      offsetX: 80,
      onPick: (hex) => {
        colorInput.value = hex;
        syncColorPalette('comment-color');
        refreshIcon(hex);
      },
      onAddToPalette: addColorToPalette,
    });
  });

  bind('btn-comment-apply', () => {
    const color = document.querySelector<HTMLInputElement>('#comment-color')?.value || DEFAULT_COLOR;
    saveCommentColor(color);
    const noteIds = selectedCommentIds;
    const ids = targets.length ? targets : resolveTargets();
    const hasComments = noteIds.length > 0 || (ids.length > 0 && store.doc.annotations.some((annotation) => {
      if (annotation.type !== 'comment') return false;
      return ids.includes(annotation.anchor.blockId)
        || Boolean(annotation.anchor.blockIds?.some((id) => ids.includes(id)));
    }));
    if (noteIds.length) {
      store.dispatch(() => setCommentColorByIdsOp(store.doc, noteIds, color));
      for (const id of noteIds) {
        document.querySelector<HTMLElement>(`.comment-line[data-comment-id="${CSS.escape(id)}"]`)
          ?.style.setProperty('--comment-color', color);
      }
    } else if (ids.length) store.dispatch(() => setCommentColorOp(store.doc, ids, color));
    closePanel();
    refreshIcon(color);
    if (!hasComments && ids.length) comments.openSelection(ids);
  });

  bind('btn-comment-cancel', () => {
    const color = document.querySelector<HTMLInputElement>('#comment-color');
    if (color) color.value = loadCommentColor();
    syncColorPalette('comment-color');
    refreshIcon();
    closePanel();
  });

  bind('btn-comment-delete', () => {
    const targetIds = new Set(targets.length ? targets : resolveTargets());
    const ids = selectedCommentIds.length
      ? selectedCommentIds
      : store.doc.annotations
        .filter((annotation) => annotation.type === 'comment' && (
          targetIds.has(annotation.anchor.blockId)
          || Boolean(annotation.anchor.blockIds?.some((id) => targetIds.has(id)))
        ))
        .map((annotation) => annotation.id);
    if (!ids.length) return;
    store.dispatch(() => removeNotesOp(store.doc, ids));
    comments.clearCommentSelection();
    closePanel();
    refreshIcon();
  });
}
