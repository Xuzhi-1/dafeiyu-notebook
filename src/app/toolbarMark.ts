/** 工具栏标记：快捷标记、标记面板、标记外观。 */

import { defaultMark, setMarkOp } from '../core/notes.js';
import { addColorToPalette, syncColorPalette } from '../ui/colorPalette.js';
import { openColorPicker } from '../ui/mark/colorPicker.js';
import { applyMarkPanel, closeMarkPanel, openMarkPanel, removeMarkPanel } from '../ui/mark/markPanel.js';
import {
  loadMarkAppearance, refreshMarkToolbarIcon, saveMarkAppearance, saveMarkAppearanceFromInputs,
  setMarkAppearanceInputs,
} from '../ui/mark/markAppearance.js';
import { activeId, type AppState } from './state.js';

export interface MarkControlDeps {
  state: AppState;
  resolveTargets: () => string[];
  markWithImage: () => Promise<void>;
}

export function installToolbarMark({ state, resolveTargets, markWithImage }: MarkControlDeps): void {
  const { store } = state;
  let markPanelTargets: string[] = [];

  const bind = (id: string, handler: () => void): void => {
    const button = document.querySelector<HTMLButtonElement>(`#${id}`);
    if (!button) return;
    button.addEventListener('mousedown', (event) => event.preventDefault());
    button.addEventListener('click', handler);
  };

  const initial = setMarkAppearanceInputs();
  refreshMarkToolbarIcon(initial.color, initial.icon);
  document.querySelector<HTMLInputElement>('#mark-color')?.addEventListener('input', () => {
    refreshMarkToolbarIcon();
  });
  document.querySelector<HTMLInputElement>('#mark-icon')?.addEventListener('change', () => {
    refreshMarkToolbarIcon();
  });

  bind('btn-mark', () => {
    const ids = resolveTargets();
    const { color, icon } = loadMarkAppearance();
    if (
      ids.length
      && store.dispatch(() => setMarkOp(store.doc, ids, { ...defaultMark('mark'), color, icon }))
    ) {
      refreshMarkToolbarIcon(color, icon);
      store.setSelection({ blockIds: [], activeId: null });
    }
  });

  bind('btn-unmark', () => {
    const ids = resolveTargets();
    if (ids.length) store.dispatch(() => setMarkOp(store.doc, ids, null));
  });

  document.addEventListener('dfy:mark-panel-dismissed', () => {
    const appearance = saveMarkAppearanceFromInputs();
    refreshMarkToolbarIcon(appearance.color, appearance.icon);
    markPanelTargets = [];
  });

  bind('btn-mark-more', () => {
    const panel = document.querySelector<HTMLElement>('#mark-panel');
    if (panel && !panel.hidden) {
      panel.hidden = true;
      document.dispatchEvent(new CustomEvent('dfy:mark-panel-dismissed'));
      markPanelTargets = [];
      return;
    }
    markPanelTargets = resolveTargets();
    openMarkPanel(store, markPanelTargets[0] ?? activeId(state));
    refreshMarkToolbarIcon();
  });

  bind('mark-color-btn', () => {
    const button = document.querySelector<HTMLElement>('#mark-color-btn');
    const input = document.querySelector<HTMLInputElement>('#mark-color');
    const markPanel = document.querySelector<HTMLElement>('#mark-panel');
    if (!button || !input) return;
    openColorPicker({
      anchor: button,
      color: input.value || '#ED7D31',
      offsetX: 80,
      onPick: (hex) => {
        input.value = hex;
        button.style.background = hex;
        syncColorPalette('mark-color');
        refreshMarkToolbarIcon(hex);
      },
      onAddToPalette: addColorToPalette,
      onClose: () => {
        if (markPanel) markPanel.hidden = false;
      },
    });
  });

  bind('btn-mark-image', () => { void markWithImage(); });

  bind('btn-mark-apply', () => {
    const ids = markPanelTargets.length ? markPanelTargets : resolveTargets();
    const colorInput = document.querySelector<HTMLInputElement>('#mark-color');
    const iconInput = document.querySelector<HTMLInputElement>('#mark-icon');
    const saved = loadMarkAppearance();
    const color = colorInput?.value || saved.color;
    const icon = iconInput?.value || saved.icon;
    const appearance = saveMarkAppearance({ color, icon });
    refreshMarkToolbarIcon(appearance.color, appearance.icon);
    if (ids.length) {
      applyMarkPanel(store, ids);
      store.setSelection({ blockIds: [], activeId: null });
    } else {
      closeMarkPanel();
    }
    markPanelTargets = [];
  });

  bind('btn-mark-cancel', () => {
    markPanelTargets = [];
    const appearance = setMarkAppearanceInputs();
    syncColorPalette('mark-color');
    refreshMarkToolbarIcon(appearance.color, appearance.icon);
    closeMarkPanel();
  });

  bind('btn-mark-delete', () => {
    const ids = markPanelTargets.length ? markPanelTargets : resolveTargets();
    removeMarkPanel(store, ids);
    markPanelTargets = [];
  });
}
