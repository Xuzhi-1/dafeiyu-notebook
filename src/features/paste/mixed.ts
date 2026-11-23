/** 图文混合粘贴：按 HTML 中的图片位置切成文本/图片 block。 */

import type { Store } from '../../core/store.js';
import { selectMany } from '../../core/selection.js';
import { createBlock, type Block } from '../../core/types.js';
import { plainText } from '../../core/toc.js';
import type { Op } from '../../core/ops.js';
import type { Toast } from '../../app/state.js';
import { splitPastedHtml, type PasteSegment } from '../../editor/pasteHtml.js';
import { imageFromPasteEvent, normalizeImageDataUrl, readSystemClipboardImage } from '../image/clipboard.js';

export interface MixedPasteDeps {
  store: Store;
  toast: Toast;
}

export function installMixedPaste({ store, toast }: MixedPasteDeps): void {
  document.addEventListener('paste', (event) => {
    if (event.defaultPrevented) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (target.closest('input, textarea, select, .comment-line-text, .doc-table')) return;
    const data = event.clipboardData;
    const html = data?.getData('text/html') ?? '';
    const hasMarkupImage = /<(?:img|v:imagedata|w:drawing|wp:inline|a:blip)\b/i.test(html);
    const hasEventImage = Boolean(data && [...data.items].some((item) => item.type.startsWith('image/')));
    if (!hasMarkupImage && !hasEventImage) return;
    event.preventDefault();
    event.stopPropagation();
    void pasteMixed(store, toast, html, data).catch(() => toast('粘贴图片失败'));
  }, true);
}

async function pasteMixed(store: Store, toast: Toast, html: string, data: DataTransfer | null): Promise<void> {
  const segments = html ? splitPastedHtml(html) : [];
  const imageSegments = segments.filter((segment): segment is Extract<PasteSegment, { kind: 'image' }> => segment.kind === 'image');
  const eventImage = await imageFromPasteEvent(data).catch(() => null);
  const unresolved = imageSegments.filter((segment) => !isDataImage(segment.src));
  let fallback = unresolved.length === 1
    ? (eventImage ?? await readSystemClipboardImage().catch(() => null))
    : null;
  if (!imageSegments.length && !eventImage && /<(?:v:imagedata|w:drawing|wp:inline|a:blip)\b/i.test(html)) {
    fallback = await readSystemClipboardImage().catch(() => null);
  }

  const blocks: Block[] = [];
  let missing = 0;
  for (const segment of segments) {
    if (segment.kind === 'text') {
      if (segment.html) blocks.push({ ...createBlock('paragraph'), html: segment.html });
      continue;
    }
    const source = isDataImage(segment.src) ? await normalizeImageDataUrl(segment.src) : fallback;
    if (!source) {
      missing += 1;
      continue;
    }
    blocks.push({ ...createBlock('image'), meta: { src: source, width: 100 } });
  }

  if (!imageSegments.length && eventImage) {
    blocks.push({ ...createBlock('image'), meta: { src: eventImage, width: 100 } });
  }
  if (!imageSegments.length && fallback) {
    blocks.push({ ...createBlock('image'), meta: { src: fallback, width: 100 } });
  }
  if (!blocks.length) {
    if (missing) toast('图片无法从剪贴板读取');
    return;
  }
  insertBlocks(store, blocks);
  if (missing) toast(`${missing} 张图片无法从剪贴板读取，已保留文字`);
}

function insertBlocks(store: Store, blocks: Block[]): void {
  const selected = new Set(store.selection.blockIds);
  const ordered = store.doc.blocks.filter((block) => selected.has(block.id));
  const active = document.activeElement;
  const activeBlock = active instanceof Element ? active.closest<HTMLElement>('.block') : null;
  const target = ordered[ordered.length - 1]?.id ?? activeBlock?.dataset.id ?? store.selection.activeId;
  const targetBlock = store.doc.blocks.find((block) => block.id === target);
  store.dispatch((doc) => {
    const targetIndex = targetBlock ? doc.blocks.findIndex((block) => block.id === targetBlock.id) : -1;
    const replaceEmpty = targetBlock?.type === 'paragraph' && plainText(targetBlock.html) === '';
    const at = targetIndex >= 0 ? targetIndex + (replaceEmpty ? 0 : 1) : doc.blocks.length;
    const ops: Op[] = [];
    if (replaceEmpty) ops.push({ t: 'removeBlocks', ids: [targetBlock.id] });
    ops.push({ t: 'insertBlocks', at: Math.min(at, doc.blocks.length), blocks });
    return ops;
  }, selectMany(blocks.map((block) => block.id)));
}

function isDataImage(src: string): boolean {
  return /^data:image\//i.test(src);
}
