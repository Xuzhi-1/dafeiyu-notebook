/** 工具栏文字颜色与高亮：颜色面板、图标同步、高亮模式。 */

import { applyInlineStyle } from '../editor/format.js';
import { applyTextSelection, captureTextSelection, restoreTextSelection, type TextSelectionSnapshot } from '../editor/textSelection.js';
import {
  applyHighlight, applyHighlightToBlocks, removeHighlight, removeHighlightFromBlocks, type HighlightMode,
} from '../editor/highlight.js';
import { addColorToPalette, syncColorPalette } from '../ui/colorPalette.js';
import { DEFAULT_HIGHLIGHT_COLOR, DEFAULT_TEXT_COLOR } from '../ui/colorDefaults.js';
import { openColorPicker } from '../ui/mark/colorPicker.js';
import { positionColorPanel } from '../ui/colorPanel.js';
import {
  loadHighlightColor, loadHighlightMode, loadTextColor, saveHighlightColor, saveHighlightMode, saveTextColor,
} from '../storage/appearance.js';
import type { AppState } from './state.js';

type ColorControlKind = 'text' | 'highlight';

interface ColorControl {
  readonly kind: ColorControlKind;
  readonly panelId: string;
  readonly menuId: string;
  readonly inputId: string;
  readonly swatchId: string;
  readonly fallback: string;
}

const TEXT_COLOR: ColorControl = {
  kind: 'text',
  panelId: 'text-color-panel',
  menuId: 'btn-text-color-more',
  inputId: 'text-color',
  swatchId: 'text-color-btn',
  fallback: DEFAULT_TEXT_COLOR,
};

const HIGHLIGHT_COLOR: ColorControl = {
  kind: 'highlight',
  panelId: 'highlight-color-panel',
  menuId: 'btn-highlight-more',
  inputId: 'highlight-color',
  swatchId: 'highlight-color-btn',
  fallback: DEFAULT_HIGHLIGHT_COLOR,
};

const CONTROLS = [TEXT_COLOR, HIGHLIGHT_COLOR] as const;
const HIGHLIGHT_MODES = new Set<HighlightMode>(['marker', 'solid', 'wavy', 'dashed']);

export function installToolbarStyle(state: AppState): void {
  const { store } = state;
  let highlightMode: HighlightMode = loadHighlightMode();
  let sessionSelection: TextSelectionSnapshot | null = null;
  let sessionInitialColor: string | null = null;
  let sessionEditingAtOpen = false;

  const query = <T extends Element>(selector: string): T | null => document.querySelector<T>(selector);

  const bind = (id: string, handler: () => void): void => {
    const button = query<HTMLButtonElement>(`#${id}`);
    if (!button) return;
    button.addEventListener('mousedown', (event) => event.preventDefault());
    button.addEventListener('click', handler);
  };

  const inputOf = (control: ColorControl): HTMLInputElement | null => query<HTMLInputElement>(`#${control.inputId}`);

  const colorOf = (control: ColorControl, input = inputOf(control)): string =>
    input?.value || control.fallback;

  const isEditingContent = (): boolean => {
    const active = document.activeElement;
    return active instanceof Element && Boolean(active.closest('.block-content'));
  };

  const currentTextRange = (): Range | null => {
    const selection = window.getSelection();
    if (!selection || !selection.rangeCount || selection.isCollapsed) return null;
    return selection.getRangeAt(0).cloneRange();
  };

  const closeStylePanels = (): void => {
    document.querySelectorAll<HTMLElement>('.style-panel').forEach((panel) => {
      panel.hidden = true;
    });
    sessionSelection = null;
    sessionInitialColor = null;
    sessionEditingAtOpen = false;
  };

  const refreshStyleIcon = (control: ColorControl, color?: string): void => {
    const input = inputOf(control);
    document.documentElement.style.setProperty(
      control.kind === 'text' ? '--text-color' : '--highlight-color',
      color || colorOf(control, input),
    );
  };

  const syncControl = (control: ColorControl, color: string): void => {
    const input = inputOf(control);
    if (input) input.value = color;
    if (control.kind === 'text') saveTextColor(color);
    else saveHighlightColor(color);
    syncColorPalette(control.inputId);
    refreshStyleIcon(control, color);
  };

  const setHighlightMode = (mode: HighlightMode): void => {
    highlightMode = mode;
    saveHighlightMode(mode);
    const merged = query<HTMLElement>('.tb-highlight-merged');
    if (merged) merged.dataset.mode = mode;
    document.querySelectorAll<HTMLElement>('[data-highlight-mode]').forEach((button) => {
      const active = button.dataset.highlightMode === mode;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-checked', String(active));
    });
  };

  const restoreStyleSelection = (): void => {
    applyTextSelection(sessionSelection);
  };

  const openStylePanel = (control: ColorControl): void => {
    const panel = query<HTMLElement>(`#${control.panelId}`);
    const anchor = query<HTMLElement>(`#${control.menuId}`);
    const input = inputOf(control);
    if (!panel || !anchor || !input) return;
    document.querySelectorAll<HTMLElement>('.style-panel').forEach((item) => {
      if (item !== panel) item.hidden = true;
    });
    sessionSelection = captureTextSelection();
    sessionEditingAtOpen = isEditingContent();
    sessionInitialColor = colorOf(control, input);
    if (!input.value) input.value = control.fallback;
    syncColorPalette(control.inputId);
    refreshStyleIcon(control);
    if (control.kind === 'highlight') setHighlightMode(highlightMode);
    positionColorPanel(panel, anchor);
  };

  const toggleStylePanel = (control: ColorControl): void => {
    const panel = query<HTMLElement>(`#${control.panelId}`);
    if (panel && !panel.hidden) {
      closeStylePanels();
      return;
    }
    openStylePanel(control);
  };

  const applyStylePanel = (control: ColorControl): void => {
    const input = inputOf(control);
    if (!input) return;
    const range = restoreTextSelection(sessionSelection) ?? currentTextRange();
    if (range) {
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
    }

    if (control.kind === 'text') {
      const color = colorOf(control, input);
      if (state.comments.applyColor(color)) {
        state.comments.close();
        syncControl(control, color);
        closeStylePanels();
        return;
      }
      applyInlineStyle(store, { color });
    } else {
      const style = { mode: highlightMode, color: colorOf(control, input) };
      if (state.comments.applyHighlight(style)) {
        state.comments.close();
        syncControl(control, colorOf(control, input));
        closeStylePanels();
        return;
      }
      if (!range && !sessionEditingAtOpen && store.selection.blockIds.length) {
        applyHighlightToBlocks(store, style);
      } else {
        applyHighlight(store, style);
      }
    }
    syncControl(control, colorOf(control, input));
    closeStylePanels();
  };

  const cancelStylePanel = (control: ColorControl): void => {
    const input = inputOf(control);
    if (input && sessionInitialColor) input.value = sessionInitialColor;
    syncColorPalette(control.inputId);
    refreshStyleIcon(control);
    closeStylePanels();
  };

  const applyCurrentHighlight = (): void => {
    const color = colorOf(HIGHLIGHT_COLOR);
    syncControl(HIGHLIGHT_COLOR, color);
    if (state.comments.applyHighlight({ mode: highlightMode, color })) {
      state.comments.close();
      return;
    }
    const selection = window.getSelection();
    const hasText = Boolean(selection && selection.rangeCount && !selection.isCollapsed);
    if (!hasText && !isEditingContent() && store.selection.blockIds.length) {
      applyHighlightToBlocks(store, { mode: highlightMode, color });
    } else {
      applyHighlight(store, { mode: highlightMode, color });
    }
  };

  const openControlPicker = (control: ColorControl): void => {
    const anchor = query<HTMLElement>(`#${control.swatchId}`);
    const input = inputOf(control);
    if (!anchor || !input) return;
    openColorPicker({
      anchor,
      color: colorOf(control, input),
      offsetX: 80,
      onPick: (hex) => syncControl(control, hex),
      onAddToPalette: addColorToPalette,
    });
  };

  document.querySelectorAll<HTMLElement>('.style-panel').forEach((panel) => {
    panel.addEventListener('mousedown', (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest('input, textarea, select, [contenteditable="true"], [draggable="true"]')) return;
      event.preventDefault();
    });
    panel.addEventListener('mouseup', (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest('input, textarea, select, [contenteditable="true"]')) return;
      restoreStyleSelection();
    });
    panel.addEventListener('dragend', () => restoreStyleSelection());
  });

  document.querySelectorAll<HTMLElement>('[data-highlight-mode]').forEach((button) => {
    button.addEventListener('click', () => {
      const mode = button.dataset.highlightMode;
      if (mode && HIGHLIGHT_MODES.has(mode as HighlightMode)) setHighlightMode(mode as HighlightMode);
    });
  });

  document.addEventListener('pointerdown', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (target.closest('.style-panel, #btn-text-color-more, #btn-highlight-more, #color-picker, .context-menu')) return;
    closeStylePanels();
  }, true);

  for (const control of CONTROLS) {
    const input = inputOf(control);
    const saved = control.kind === 'text' ? loadTextColor() : loadHighlightColor();
    if (input) input.value = saved;
    input?.addEventListener('input', () => refreshStyleIcon(control));
    refreshStyleIcon(control);
    bind(control.menuId, () => toggleStylePanel(control));
    bind(control.swatchId, () => openControlPicker(control));
  }

  setHighlightMode(highlightMode);

  bind('btn-text-color', () => {
    const color = colorOf(TEXT_COLOR);
    syncControl(TEXT_COLOR, color);
    if (state.comments.applyColor(color)) {
      state.comments.close();
      return;
    }
    applyInlineStyle(store, { color });
  });
  bind('btn-highlight', applyCurrentHighlight);
  bind('btn-text-color-cancel', () => cancelStylePanel(TEXT_COLOR));
  bind('btn-text-color-apply', () => applyStylePanel(TEXT_COLOR));
  bind('btn-highlight-color-cancel', () => cancelStylePanel(HIGHLIGHT_COLOR));
  bind('btn-highlight-color-apply', () => applyStylePanel(HIGHLIGHT_COLOR));
  bind('btn-highlight-delete', () => {
    if (state.comments.removeHighlight()) {
      state.comments.close();
      closeStylePanels();
      return;
    }
    const range = restoreTextSelection(sessionSelection) ?? currentTextRange();
    if (range) {
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      removeHighlight(store);
    } else {
      removeHighlightFromBlocks(store);
    }
    closeStylePanels();
  });
}
