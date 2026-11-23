/**
 * 图片文件拖入：按落点块决定复用空块或在下方插入。
 */

import type { Block } from '../../core/types.js';
import { createBlock } from '../../core/types.js';
import type { Op } from '../../core/ops.js';
import { selectMany } from '../../core/selection.js';
import { plainText } from '../../core/toc.js';
import { leaveEditing } from '../../app/editorCommands.js';
import { clearDocumentTextSelection } from '../../editor/textSelection.js';
import type { AppState, Toast } from '../../app/state.js';

export interface ImageDropTarget {
  readonly blockId: string | null;
  readonly position: 'before' | 'after' | 'inside' | 'end';
}

const MAX_BYTES = 32 * 1024 * 1024;
const TEXT_TYPES = new Set<Block['type']>(['paragraph', 'quote', 'bullet', 'number']);
const IMAGE_TYPE = /^image\/(?:png|jpe?g|gif|webp|bmp)$/i;

export function isImageFile(file: File): boolean {
  return IMAGE_TYPE.test(file.type);
}

function dataUrlOf(file: File): Promise<string | null> {
  if (!isImageFile(file) || file.size > MAX_BYTES) return Promise.resolve(null);
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
}

function imagePatch(src: string): Partial<Block> {
  return {
    type: 'image',
    html: '',
    align: undefined,
    indent: undefined,
    fontFamily: undefined,
    fontSize: undefined,
    meta: { src, width: 100 },
  };
}

/** 读取图片并按落点块插入；目标块在读取期间消失时追加到末尾。 */
export async function insertDroppedImages(
  state: AppState,
  toast: Toast,
  files: readonly File[],
  target: ImageDropTarget,
): Promise<void> {
  const urls = (await Promise.all(files.map(dataUrlOf))).filter((url): url is string => Boolean(url));
  if (!urls.length) {
    toast('没有可插入的图片，或图片超过 32MB', 3000);
    return;
  }
  leaveEditing(state);
  clearDocumentTextSelection();

  const store = state.store;
  let selectedId = '';
  const changed = store.dispatch((doc) => {
    const index = target.blockId ? doc.blocks.findIndex((block) => block.id === target.blockId) : -1;
    const block = index >= 0 ? doc.blocks[index] : undefined;
    const reusableText = target.position === 'inside' && Boolean(block && TEXT_TYPES.has(block.type) && !plainText(block.html).trim());
    const reusableImage = target.position === 'inside' && Boolean(block?.type === 'image' && !block.meta?.src);
    const ops: Op[] = [];
    const at = index >= 0 ? index + (target.position === 'before' ? 0 : 1) : doc.blocks.length;

    if (reusableText && block && urls[0]) {
      ops.push({ t: 'patchBlock', id: block.id, patch: imagePatch(urls[0]) });
      selectedId = block.id;
      if (urls.length > 1) {
        const blocks = urls.slice(1).map((src) => ({ ...createBlock('image'), meta: { src, width: 100 } }));
        ops.push({ t: 'insertBlocks', at: index + 1, blocks });
        selectedId = blocks[blocks.length - 1].id;
      }
    } else if (reusableImage && block && urls[0]) {
      ops.push({ t: 'patchBlock', id: block.id, patch: { html: '', meta: { ...block.meta, src: urls[0], width: block.meta?.width ?? 100 } } });
      selectedId = block.id;
      if (urls.length > 1) {
        const blocks = urls.slice(1).map((src) => ({ ...createBlock('image'), meta: { src, width: 100 } }));
        ops.push({ t: 'insertBlocks', at: index + 1, blocks });
        selectedId = blocks[blocks.length - 1].id;
      }
    } else {
      const blocks = urls.map((src) => ({ ...createBlock('image'), meta: { src, width: 100 } }));
      ops.push({ t: 'insertBlocks', at, blocks });
      selectedId = blocks[blocks.length - 1].id;
    }
    if (!ops.length) return null;
    return ops;
  });
  if (changed && selectedId) store.setSelection(selectMany([selectedId]));
}
