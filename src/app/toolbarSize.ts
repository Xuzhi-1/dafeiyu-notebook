/** 工具栏字号控件：数字输入 + 字号下拉。 */

import { closeFontSizeMenu, openFontSizeMenu } from '../ui/fontSizeMenu.js';
import { activeBlock, type AppState } from './state.js';
import { plainText } from '../core/toc.js';
import { loadLastFontSize } from '../ui/fontPreference.js';
import { readTargetTextFormat } from '../ui/textFormatState.js';
import { resolveTextTarget } from '../editor/textTarget.js';
import { applyTextSelection, captureTextSelection, type TextSelectionSnapshot } from '../editor/textSelection.js';

export interface SizeControlDeps {
  state: AppState;
  applyTextStyle(style: { fontSize?: string }): void;
}

export function installToolbarSize({ state, applyTextStyle }: SizeControlDeps): void {
  const sizeInput = document.querySelector<HTMLInputElement>('#font-size-input');
  const sizeMenu = document.querySelector<HTMLElement>('#font-size-menu');
  let sizeSelection: TextSelectionSnapshot | null = null;
  let suppressSizeCommit = false;

  const clampSize = (value: number): number => Math.min(160, Math.max(1, Math.round(value)));
  const DEFAULT_SIZE = 16;
  const textTypes = new Set(['paragraph', 'quote', 'bullet', 'number']);
  const blockSize = (): number => {
    const block = activeBlock(state);
    if (!block) return DEFAULT_SIZE;
    if (textTypes.has(block.type) && !plainText(block.html)) return loadLastFontSize() ?? DEFAULT_SIZE;
    return block.fontSize ?? DEFAULT_SIZE;
  };

  const selectionSize = (): number | null => {
    const format = readTargetTextFormat(resolveTextTarget(state.store), state.store);
    if (!format.hasText) return format.hasTextBlock ? loadLastFontSize() : null;
    return format.fontSize;
  };

  const refreshSizeInput = (): void => {
    if (!sizeInput || document.activeElement === sizeInput) return;
    const size = selectionSize();
    sizeInput.value = size ? String(size) : '';
  };

  const applySize = (size: number): void => {
    const value = clampSize(size);
    if (sizeInput) sizeInput.value = String(value);
    if (sizeSelection) {
      applyTextSelection(sizeSelection);
      sizeSelection = null;
    }
    applyTextStyle({ fontSize: `${value}px` });
  };

  const commitSize = (): void => {
    const raw = Number(sizeInput?.value);
    if (!Number.isFinite(raw) || raw <= 0) return;
    applySize(raw);
  };

  sizeInput?.addEventListener('pointerdown', () => {
    sizeSelection = captureTextSelection();
  });

  sizeInput?.addEventListener('focus', () => {
    const current = selectionSize();
    if (current) sizeInput.value = String(current);
    sizeInput.select();
  });

  sizeInput?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      commitSize();
      if (document.activeElement === sizeInput) {
        suppressSizeCommit = true;
        sizeInput.blur();
      }
    } else if (event.key === 'Escape') {
      event.preventDefault();
      suppressSizeCommit = true;
      sizeInput.value = String(blockSize());
      sizeInput.blur();
    }
  });

  sizeInput?.addEventListener('blur', () => {
    if (suppressSizeCommit) {
      suppressSizeCommit = false;
      return;
    }
    commitSize();
  });

  document.addEventListener('selectionchange', refreshSizeInput);
  state.store.subscribe(refreshSizeInput);
  refreshSizeInput();

  sizeMenu?.addEventListener('mousedown', (event) => event.preventDefault());
  sizeMenu?.addEventListener('click', () => {
    if (document.querySelector('.size-popover')) {
      closeFontSizeMenu();
      return;
    }
    const current = selectionSize() ?? activeBlock(state)?.fontSize ?? (Number(sizeInput?.value) || DEFAULT_SIZE);
    openFontSizeMenu(sizeMenu, current, (size) => {
      if (sizeInput) sizeInput.value = String(size);
      applyTextStyle({ fontSize: `${size}px` });
    });
  });
}
