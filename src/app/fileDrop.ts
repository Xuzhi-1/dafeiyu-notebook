/** 外部文件拖放：.dfy 打开文档，图片按落点插入。 */

import type { FileActions } from './files.js';
import { isImageFile, type ImageDropTarget } from '../features/image/drop.js';

export interface FileDropDeps {
  files: FileActions;
  insertImages(files: readonly File[], target: ImageDropTarget): void;
}

export function installFileDrop({ files, insertImages }: FileDropDeps): void {
  let dropHint: HTMLElement | null = null;
  let dropLine: HTMLElement | null = null;
  let dropTarget: HTMLElement | null = null;
  let draggingImages = false;

  const showDropHint = (text: string): void => {
    if (!dropHint) {
      dropHint = document.createElement('div');
      dropHint.className = 'drop-hint';
      document.body.appendChild(dropHint);
    }
    dropHint.textContent = text;
  };
  const hideDropHint = (): void => {
    dropHint?.remove();
    dropHint = null;
  };
  const hideDropLine = (): void => {
    dropLine?.remove();
    dropLine = null;
  };
  const setDropTarget = (block: HTMLElement | null): void => {
    if (dropTarget === block) return;
    dropTarget?.classList.remove('is-drop-target');
    dropTarget = block;
    dropTarget?.classList.add('is-drop-target');
  };
  const hasImage = (dataTransfer: DataTransfer | null): boolean => (
    [...(dataTransfer?.items ?? [])].some((item) => item.kind === 'file' && item.type.startsWith('image/'))
  );
  const targetAt = (x: number, y: number): ImageDropTarget | null => {
    const workspace = document.querySelector<HTMLElement>('#workspace');
    const host = document.querySelector<HTMLElement>('#blocks');
    if (!workspace || !host) return null;
    const bounds = workspace.getBoundingClientRect();
    if (x < bounds.left || x > bounds.right || y < bounds.top || y > bounds.bottom) return null;
    const hit = document.elementFromPoint(x, y)?.closest<HTMLElement>('.block');
    if (hit && host.contains(hit)) {
      const rect = hit.getBoundingClientRect();
      const edge = Math.min(8, rect.height / 2);
      return {
        blockId: hit.dataset.id ?? null,
        position: y < rect.top + edge ? 'before' : y > rect.bottom - edge ? 'after' : 'inside',
      };
    }
    const blocks = [...host.querySelectorAll<HTMLElement>('.block')];
    if (!blocks.length) return { blockId: null, position: 'end' };
    for (const block of blocks) {
      const rect = block.getBoundingClientRect();
      if (y < rect.top) return { blockId: block.dataset.id ?? null, position: 'before' };
      if (y <= rect.bottom) return { blockId: block.dataset.id ?? null, position: 'inside' };
    }
    return { blockId: blocks[blocks.length - 1].dataset.id ?? null, position: 'after' };
  };
  const showDropLine = (target: ImageDropTarget): void => {
    const workspace = document.querySelector<HTMLElement>('#workspace');
    const host = document.querySelector<HTMLElement>('#blocks');
    if (!workspace || !host) {
      hideDropLine();
      setDropTarget(null);
      return;
    }
    const blocks = [...host.querySelectorAll<HTMLElement>('.block')];
    const block = target.blockId
      ? blocks.find((item) => item.dataset.id === target.blockId)
      : blocks[blocks.length - 1];
    if (!block) {
      hideDropLine();
      setDropTarget(null);
      return;
    }
    if (target.position === 'inside') {
      hideDropLine();
      setDropTarget(block);
      return;
    }
    setDropTarget(null);
    const rect = block.getBoundingClientRect();
    const bounds = workspace.getBoundingClientRect();
    if (!dropLine) {
      dropLine = document.createElement('div');
      dropLine.className = 'drop-line';
      workspace.appendChild(dropLine);
    }
    dropLine.style.top = `${(target.position === 'before' ? rect.top : rect.bottom) - bounds.top + workspace.scrollTop - 1}px`;
    dropLine.style.left = `${rect.left - bounds.left + workspace.scrollLeft}px`;
    dropLine.style.right = 'auto';
    dropLine.style.width = `${rect.width}px`;
  };
  const cleanupDrag = (): void => {
    draggingImages = false;
    hideDropHint();
    hideDropLine();
    setDropTarget(null);
  };

  window.addEventListener('dragenter', (event) => {
    if (!event.dataTransfer?.types?.includes('Files')) return;
    draggingImages = hasImage(event.dataTransfer);
    if (draggingImages) hideDropHint();
    else showDropHint('松开打开 .dfy 文档');
  });
  window.addEventListener('dragover', (event) => {
    if (!event.dataTransfer?.types?.includes('Files')) return;
    event.preventDefault();
    if (!draggingImages) {
      hideDropLine();
      return;
    }
    const target = targetAt(event.clientX, event.clientY);
    if (target) showDropLine(target);
    else {
      hideDropLine();
      setDropTarget(null);
    }
    event.dataTransfer.dropEffect = 'copy';
  });
  window.addEventListener('dragleave', (event) => {
    if (event.relatedTarget === null) cleanupDrag();
  });
  window.addEventListener('drop', (event) => {
    if (!event.dataTransfer) return;
    event.preventDefault();
    const target = targetAt(event.clientX, event.clientY);
    const all = [...event.dataTransfer.files];
    cleanupDrag();
    for (const file of all) {
      const path = window.moye?.getPathForFile?.(file) ?? '';
      if (/\.dfy$/i.test(path)) {
        void files.openPath(path);
        return;
      }
    }
    const images = all.filter(isImageFile);
    if (images.length) insertImages(images, target ?? { blockId: null, position: 'end' });
  });
  window.addEventListener('dragend', cleanupDrag);
}
