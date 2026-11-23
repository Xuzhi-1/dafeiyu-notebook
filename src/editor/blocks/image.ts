/**
 * 图片块视图：meta.src + meta.width（百分比）。
 * 右下角手柄拖动改宽度，双击恢复 100%。
 */

import type { Block } from '../../core/types.js';

export const IMAGE_WIDTH_EVENT = 'dfy:image-width';

export interface ImageWidthDetail {
  id: string;
  width: number;
}

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

export function createImageView(block: Block): HTMLElement {
  const el = document.createElement('div');
  el.className = 'block block-image';
  el.dataset.id = block.id;
  el.dataset.align = block.align ?? 'left';

  const frame = document.createElement('div');
  frame.className = 'image-frame';
  frame.style.width = `${block.meta?.width ?? 100}%`;

  const img = document.createElement('img');
  img.alt = block.meta?.caption ?? '';
  if (block.meta?.src) img.src = block.meta.src;
  frame.appendChild(img);

  const handle = document.createElement('span');
  handle.className = 'image-resize-handle';
  handle.title = '拖动调整宽度，双击恢复';
  handle.setAttribute('aria-hidden', 'true');
  frame.appendChild(handle);
  el.appendChild(frame);

  const emit = (width: number): void => {
    el.dispatchEvent(new CustomEvent<ImageWidthDetail>(IMAGE_WIDTH_EVENT, {
      bubbles: true,
      detail: { id: block.id, width },
    }));
  };

  handle.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startPx = frame.getBoundingClientRect().width;
    const startStyle = frame.style.width;
    const blockPx = Math.max(1, el.getBoundingClientRect().width);
    let width = clamp(block.meta?.width ?? 100, 10, 100);
    let moved = false;

    function cleanup(): void {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', finish);
      document.removeEventListener('pointercancel', cancel);
    }
    function move(moveEvent: PointerEvent): void {
      const dx = moveEvent.clientX - startX;
      if (!moved && dx === 0) return;
      moved = true;
      const nextPx = clamp(startPx + dx, blockPx * 0.1, blockPx);
      width = clamp(Math.round((nextPx / blockPx) * 100), 10, 100);
      frame.style.width = `${width}%`;
    }
    function finish(): void {
      cleanup();
      if (!moved) {
        frame.style.width = startStyle;
        return;
      }
      emit(width);
    }
    function cancel(): void {
      cleanup();
      frame.style.width = startStyle;
    }

    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', finish);
    document.addEventListener('pointercancel', cancel);
  });

  frame.addEventListener('dblclick', (event) => {
    event.preventDefault();
    event.stopPropagation();
    emit(100);
  });

  return el;
}

export function updateImageView(el: HTMLElement, block: Block, previous: Block | undefined): void {
  const frame = el.querySelector<HTMLElement>('.image-frame');
  const img = el.querySelector<HTMLImageElement>('img');
  if (!frame || !img) return;
  if (previous?.align !== block.align) el.dataset.align = block.align ?? 'left';
  if (previous?.meta?.src !== block.meta?.src && block.meta?.src) img.src = block.meta.src;
  if (previous?.meta?.caption !== block.meta?.caption) img.alt = block.meta?.caption ?? '';
  if (previous?.meta?.width !== block.meta?.width) frame.style.width = `${block.meta?.width ?? 100}%`;
}
