/** 目录宽度拖动：只改布局变量，拖动结束再持久化。 */

import { notifyLayoutChange } from './searchLayout.js';

const STORAGE_KEY = 'dafeiyu-next.outline-width';
const DEFAULT_WIDTH = 220;
const MIN_WIDTH = 200;
const MAX_WIDTH = 560;

const clampWidth = (value: number): number =>
  Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, Math.round(value)));

export function installOutlineResizer(): void {
  const layout = document.querySelector<HTMLElement>('.layout');
  const resizer = document.querySelector<HTMLElement>('#outline-resizer');
  if (!layout || !resizer) return;

  let width = DEFAULT_WIDTH;
  try {
    const saved = Number(localStorage.getItem(STORAGE_KEY));
    if (Number.isFinite(saved) && saved > 0) width = clampWidth(saved);
  } catch {
    // localStorage 不可用时使用默认宽度。
  }

  let resizeFrame = 0;
  const notifyResize = (): void => {
    if (resizeFrame) return;
    resizeFrame = requestAnimationFrame(() => {
      resizeFrame = 0;
      notifyLayoutChange();
    });
  };

  const applyWidth = (next: number): void => {
    width = clampWidth(next);
    layout.style.setProperty('--outline-width', `${width}px`);
    resizer.setAttribute('aria-valuenow', String(width));
    notifyResize();
  };

  resizer.setAttribute('aria-valuemin', String(MIN_WIDTH));
  resizer.setAttribute('aria-valuemax', String(MAX_WIDTH));
  applyWidth(width);

  resizer.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = width;
    document.body.classList.add('is-outline-resizing');
    try {
      resizer.setPointerCapture(event.pointerId);
    } catch {
      // 合成事件可能不支持 pointer capture，document 监听仍然有效。
    }

    const onMove = (moveEvent: PointerEvent): void => {
      applyWidth(startWidth + moveEvent.clientX - startX);
    };

    const finish = (): void => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', finish);
      document.removeEventListener('pointercancel', finish);
      document.body.classList.remove('is-outline-resizing');
      try {
        localStorage.setItem(STORAGE_KEY, String(width));
      } catch {
        // 忽略存储失败。
      }
    };

    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', finish);
    document.addEventListener('pointercancel', finish);
  });
}
