/** 读取一个文本块内实际使用的字体/字号；混合时对应值为 null。 */

import { DEFAULT_FONT_FAMILY } from '../core/font.js';
import { plainText } from '../core/toc.js';
import type { Store } from '../core/store.js';
import type { TextTarget } from '../editor/textTarget.js';

export interface BlockTextFormat {
  readonly fontFamily: string | null;
  readonly fontSize: number | null;
  readonly hasText: boolean;
}

function fontOptionValue(computed: string): string | null {
  const first = computed.split(',')[0]?.trim().replace(/^["']|["']$/g, '') ?? '';
  if (!first) return null;
  const select = document.querySelector<HTMLSelectElement>('#font-family');
  if (!select) return first;
  const match = [...select.options].find((option) => (
    option.value === first || (first === DEFAULT_FONT_FAMILY && option.value === '')
  ));
  return match ? match.value : null;
}

export interface TargetTextFormat {
  readonly fontFamily: string | null;
  readonly fontSize: number | null;
  readonly hasText: boolean;
  readonly hasTextBlock: boolean;
}

/** 统一读取文字选区、光标、块选区的有效格式。 */
export function readTargetTextFormat(target: TextTarget, store: Store): TargetTextFormat {
  const result = { families: new Set<string>(), sizes: new Set<number>(), hasText: false, invalidFamily: false };
  const add = (fontFamily: string | null, fontSize: number | null): void => {
    result.hasText = true;
    if (fontFamily === null) result.invalidFamily = true;
    else result.families.add(fontFamily);
    if (fontSize !== null && Number.isFinite(fontSize)) result.sizes.add(fontSize);
  };
  if (target.kind === 'text' && target.range) {
    const host = document.querySelector<HTMLElement>('#blocks');
    if (host) {
      const walker = document.createTreeWalker(host, NodeFilter.SHOW_TEXT);
      let node = walker.nextNode();
      while (node) {
        const text = node as Text;
        if (text.data.trim() && target.range.intersectsNode(text) && text.parentElement) {
          const style = getComputedStyle(text.parentElement);
          add(fontOptionValue(style.fontFamily), Math.round(Number.parseFloat(style.fontSize)));
        }
        node = walker.nextNode();
      }
    }
  } else if (target.kind === 'caret' && target.caretElement) {
    const style = getComputedStyle(target.caretElement);
    add(fontOptionValue(style.fontFamily), Math.round(Number.parseFloat(style.fontSize)));
  } else if (target.kind === 'block' || target.kind === 'caret') {
    for (const id of target.blockIds) {
      const block = store.doc.blocks.find((item) => item.id === id);
      if (!block) continue;
      const blockEl = document.querySelector<HTMLElement>(`.block[data-id="${CSS.escape(id)}"]`);
      const content = blockEl?.querySelector<HTMLElement>('.block-content');
      const previewSize = content ? Number.parseFloat(content.style.fontSize) : NaN;
      if (!plainText(block.html)) {
        if (content?.style.fontSize && Number.isFinite(previewSize)) {
          const style = getComputedStyle(content);
          add(fontOptionValue(style.fontFamily), Math.round(previewSize));
        }
        continue;
      }
      const format = readBlockTextFormat(blockEl);
      if (format.hasText) {
        add(format.fontFamily, format.fontSize);
      } else {
        add(fontOptionValue(block.fontFamily ?? ''), block.fontSize ?? 16);
      }
    }
  }
  return {
    fontFamily: result.hasText && !result.invalidFamily && result.families.size === 1 ? [...result.families][0] : null,
    fontSize: result.hasText && result.sizes.size === 1 ? [...result.sizes][0] : null,
    hasText: result.hasText,
    hasTextBlock: target.kind !== 'none',
  };
}

export function readBlockTextFormat(blockEl: HTMLElement | null): BlockTextFormat {
  const content = blockEl?.querySelector<HTMLElement>('.block-content');
  if (!content) return { fontFamily: null, fontSize: null, hasText: false };
  const families = new Set<string>();
  const sizes = new Set<number>();
  let hasText = false;
  let invalidFamily = false;
  const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    const text = node as Text;
    const parent = text.parentElement;
    if (text.data.trim() && parent) {
      hasText = true;
      const style = getComputedStyle(parent);
      const family = fontOptionValue(style.fontFamily);
      if (family === null) invalidFamily = true;
      else families.add(family);
      const size = Math.round(Number.parseFloat(style.fontSize));
      if (Number.isFinite(size)) sizes.add(size);
    }
    node = walker.nextNode();
  }
  return {
    fontFamily: hasText && !invalidFamily && families.size === 1 ? [...families][0] : null,
    fontSize: hasText && sizes.size === 1 ? [...sizes][0] : null,
    hasText,
  };
}
