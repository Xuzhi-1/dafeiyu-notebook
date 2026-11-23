/** 图片剪裁浮层：自由比例，返回原图像素坐标。 */

import type { CropRect } from './ops.js';

export interface CropOverlayOptions {
  src: string;
  onConfirm: (rect: CropRect) => void;
  onCancel?: () => void;
}

interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

export function openImageCrop(options: CropOverlayOptions): void {
  const overlay = document.createElement('div');
  overlay.className = 'crop-overlay';
  const dialog = document.createElement('div');
  dialog.className = 'crop-dialog';
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-label', '剪裁图片');

  const viewport = document.createElement('div');
  viewport.className = 'crop-viewport';
  const wrap = document.createElement('div');
  wrap.className = 'crop-wrap';
  const image = document.createElement('img');
  image.className = 'crop-image';
  image.alt = '';
  image.src = options.src;
  const box = document.createElement('div');
  box.className = 'crop-box';
  for (const handle of ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']) {
    const grip = document.createElement('span');
    grip.className = `crop-handle crop-handle-${handle}`;
    grip.dataset.handle = handle;
    box.appendChild(grip);
  }
  wrap.append(image, box);
  viewport.appendChild(wrap);

  const toolbar = document.createElement('div');
  toolbar.className = 'crop-toolbar';
  const hint = document.createElement('span');
  hint.className = 'crop-hint';
  hint.textContent = '拖动边框选择剪裁区域';
  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.textContent = '取消';
  const confirm = document.createElement('button');
  confirm.type = 'button';
  confirm.className = 'primary';
  confirm.textContent = '确认剪裁';
  confirm.disabled = true;
  toolbar.append(hint, cancel, confirm);
  dialog.append(viewport, toolbar);
  overlay.appendChild(dialog);
  document.body.appendChild(overlay);
  document.body.classList.add('is-cropping');

  let boxRect: Box = { left: 0, top: 0, width: 0, height: 0 };

  const render = (): void => {
    box.style.left = `${boxRect.left}px`;
    box.style.top = `${boxRect.top}px`;
    box.style.width = `${boxRect.width}px`;
    box.style.height = `${boxRect.height}px`;
  };

  const maxSize = (): { width: number; height: number } => ({
    width: Math.max(1, wrap.clientWidth),
    height: Math.max(1, wrap.clientHeight),
  });

  const resetBox = (): void => {
    const { width, height } = maxSize();
    boxRect = {
      left: Math.round(width * 0.1),
      top: Math.round(height * 0.1),
      width: Math.round(width * 0.8),
      height: Math.round(height * 0.8),
    };
    render();
  };

  let cleanupDrag: (() => void) | null = null;
  const onPointerDown = (event: PointerEvent): void => {
    if (event.button !== 0) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    const handle = target.closest<HTMLElement>('[data-handle]');
    const mode = handle?.dataset.handle ?? (target === box ? 'move' : null);
    if (!mode) return;
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startY = event.clientY;
    const start = { ...boxRect };
    const limits = maxSize();
    const move = (moveEvent: PointerEvent): void => {
      const dx = moveEvent.clientX - startX;
      const dy = moveEvent.clientY - startY;
      let left = start.left;
      let top = start.top;
      let right = start.left + start.width;
      let bottom = start.top + start.height;
      if (mode === 'move') {
        left = clamp(start.left + dx, 0, limits.width - start.width);
        top = clamp(start.top + dy, 0, limits.height - start.height);
        boxRect = { left, top, width: start.width, height: start.height };
      } else {
        if (mode.includes('w')) left = clamp(start.left + dx, 0, right - 24);
        if (mode.includes('e')) right = clamp(right + dx, left + 24, limits.width);
        if (mode.includes('n')) top = clamp(start.top + dy, 0, bottom - 24);
        if (mode.includes('s')) bottom = clamp(bottom + dy, top + 24, limits.height);
        boxRect = { left, top, width: right - left, height: bottom - top };
      }
      render();
    };
    const finish = (): void => {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', finish);
      document.removeEventListener('pointercancel', finish);
      cleanupDrag = null;
    };
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', finish);
    document.addEventListener('pointercancel', finish);
    cleanupDrag = finish;
  };

  const close = (): void => {
    cleanupDrag?.();
    document.removeEventListener('keydown', onKeyDown, true);
    document.body.classList.remove('is-cropping');
    overlay.remove();
  };

  const submit = (): void => {
    const width = image.clientWidth;
    const height = image.clientHeight;
    if (!width || !height) return;
    const scaleX = image.naturalWidth / width;
    const scaleY = image.naturalHeight / height;
    const rect = {
      x: boxRect.left * scaleX,
      y: boxRect.top * scaleY,
      width: boxRect.width * scaleX,
      height: boxRect.height * scaleY,
    };
    close();
    options.onConfirm(rect);
  };

  const cancelCrop = (): void => {
    close();
    options.onCancel?.();
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      cancelCrop();
    }
  };

  box.addEventListener('pointerdown', onPointerDown);
  cancel.addEventListener('click', cancelCrop);
  confirm.addEventListener('click', submit);
  overlay.addEventListener('pointerdown', (event) => {
    if (event.target === overlay) cancelCrop();
  });
  document.addEventListener('keydown', onKeyDown, true);

  const ready = (): void => {
    confirm.disabled = false;
    resetBox();
    confirm.focus();
  };
  if (image.complete && image.naturalWidth) ready();
  else {
    image.addEventListener('load', ready, { once: true });
    image.addEventListener('error', cancelCrop, { once: true });
  }
}
