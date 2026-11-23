/**
 * 把当前编辑位置的有效字体/字号同步为新建空块的全局偏好。
 * 只处理折叠光标、有文本的单个文本块；混合格式由工具栏读取结果统一跳过。
 */

import type { Store } from '../core/store.js';
import { plainText } from '../core/toc.js';
import { readTargetTextFormat } from '../ui/textFormatState.js';
import { loadLastFontFamily, loadLastFontSize, saveLastFontFamily, saveLastFontSize } from '../ui/fontPreference.js';
import { resolveTextTarget } from '../editor/textTarget.js';

const TEXT_TYPES = new Set(['paragraph', 'quote', 'bullet', 'number']);

export function installFontPreferenceSync(store: Store): () => void {
  let frame = 0;

  const sync = (): void => {
    const active = document.activeElement;
    if (!(active instanceof HTMLElement) || !active.classList.contains('block-content')) return;
    const blockEl = active.closest<HTMLElement>('.block');
    const blockId = blockEl?.dataset.id;
    if (!blockId || store.selection.blockIds.length > 1) return;
    const block = store.doc.blocks.find((item) => item.id === blockId);
    if (!block || !TEXT_TYPES.has(block.type) || !plainText(block.html).trim()) return;
    const selection = window.getSelection();
    if (!selection || !selection.rangeCount || !selection.isCollapsed) return;
    const format = readTargetTextFormat(resolveTextTarget(store), store);
    if (format.fontFamily === null || format.fontSize === null) return;
    if (loadLastFontFamily() !== format.fontFamily) saveLastFontFamily(format.fontFamily);
    if (loadLastFontSize() !== format.fontSize) saveLastFontSize(format.fontSize);
  };

  const schedule = (): void => {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      sync();
    });
  };

  document.addEventListener('focusin', schedule);
  document.addEventListener('selectionchange', schedule);
  document.addEventListener('input', schedule);
  document.addEventListener('compositionend', schedule);

  return () => {
    document.removeEventListener('focusin', schedule);
    document.removeEventListener('selectionchange', schedule);
    document.removeEventListener('input', schedule);
    document.removeEventListener('compositionend', schedule);
    if (frame) cancelAnimationFrame(frame);
  };
}
