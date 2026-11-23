import { focusToolbarPanel } from './panelFocus.js';

/** 字号下拉：可滚动预设列表，使用当前文字选区。 */

const SIZES = [
  1, 2, 4, 6, 8, 9, 10, 11, 12, 14,
  16, 18, 20, 22, 24, 26, 28, 32, 36, 40,
  48, 56, 64, 72, 96, 120, 144, 160,
];

let panel: HTMLElement | null = null;
let cleanup: (() => void) | null = null;

function clampSize(value: number): number {
  return Math.min(160, Math.max(1, Math.round(value)));
}

export function closeFontSizeMenu(): void {
  cleanup?.();
  cleanup = null;
  panel?.remove();
  panel = null;
}

function captureRange(): Range | null {
  const selection = window.getSelection();
  if (!selection || !selection.rangeCount || selection.isCollapsed) return null;
  return selection.getRangeAt(0).cloneRange();
}

function restoreRange(range: Range): void {
  if (!range.commonAncestorContainer.isConnected) return;
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

export function openFontSizeMenu(
  anchor: HTMLElement,
  value: number,
  onPick: (size: number) => void,
): void {
  closeFontSizeMenu();
  const savedRange = captureRange();
  const initial = clampSize(value || 16);
  panel = document.createElement('div');
  panel.className = 'size-popover';
  panel.innerHTML = `<div class="size-list" role="listbox" aria-label="字号">
    ${SIZES.map((size) => `<button type="button" class="size-preset${size === initial ? ' is-on' : ''}" data-size="${size}" role="option" aria-selected="${size === initial}">
      <span>${size} pt</span><span class="size-check">${size === initial ? '✓' : ''}</span>
    </button>`).join('')}
  </div>`;
  document.body.appendChild(panel);

  const pick = (size: number): void => {
    const next = clampSize(size);
    if (savedRange) restoreRange(savedRange);
    onPick(next);
    closeFontSizeMenu();
  };

  panel.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const preset = target.closest<HTMLElement>('[data-size]');
    if (preset) pick(Number(preset.dataset.size) || initial);
  });

  const rect = anchor.getBoundingClientRect();
  const width = panel.offsetWidth;
  const height = panel.offsetHeight;
  panel.style.left = `${Math.max(8, Math.min(window.innerWidth - width - 8, rect.left))}px`;
  panel.style.top = `${Math.max(8, Math.min(window.innerHeight - height - 8, rect.bottom + 4))}px`;

  const list = panel.querySelector<HTMLElement>('.size-list');
  const active = panel.querySelector<HTMLElement>('.size-preset.is-on');
  if (list && active && list.clientHeight > 0) {
    const listRect = list.getBoundingClientRect();
    const itemRect = active.getBoundingClientRect();
    const offset = (itemRect.top - listRect.top) - (list.clientHeight - itemRect.height) / 2;
    const max = Math.max(0, list.scrollHeight - list.clientHeight);
    list.scrollTop = Math.max(0, Math.min(max, list.scrollTop + offset));
  }
  focusToolbarPanel(panel);

  const onPointerDown = (event: PointerEvent): void => {
    if (event.target instanceof Node && panel?.contains(event.target)) return;
    closeFontSizeMenu();
  };
  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeFontSizeMenu();
    }
  };
  const onScroll = (event: Event): void => {
    if (event.target instanceof Node && panel?.contains(event.target)) return;
    closeFontSizeMenu();
  };
  const onResize = (): void => closeFontSizeMenu();
  const timer = window.setTimeout(() => {
    document.addEventListener('pointerdown', onPointerDown, true);
  }, 0);
  document.addEventListener('keydown', onKeyDown, true);
  window.addEventListener('resize', onResize);
  window.addEventListener('scroll', onScroll, true);
  cleanup = () => {
    window.clearTimeout(timer);
    document.removeEventListener('pointerdown', onPointerDown, true);
    document.removeEventListener('keydown', onKeyDown, true);
    window.removeEventListener('resize', onResize);
    window.removeEventListener('scroll', onScroll, true);
  };
}
