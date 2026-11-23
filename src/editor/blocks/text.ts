/**
 * 段落 / 引用 / 列表：共用同一个文本块视图，靠 type 决定样式类。
 */

import type { Block } from '../../core/types.js';
import { sanitizeInline } from '../sanitize.js';
import { cssFontFamily } from '../../core/font.js';

export function createTextView(block: Block): HTMLElement {
  const el = document.createElement('div');
  el.className = `block block-${block.type}`;
  el.dataset.id = block.id;
  const content = document.createElement('div');
  content.className = 'block-content';
  content.contentEditable = 'true';
  content.spellcheck = false;
  content.dataset.input = '1';
  content.innerHTML = sanitizeInline(block.html);
  el.appendChild(content);
  applyTextStyle(el, block);
  return el;
}

export function applyTextStyle(el: HTMLElement, block: Block): void {
  el.style.textAlign = block.align ?? '';
  el.style.paddingLeft = block.indent ? `${block.indent * 24}px` : '';
  el.style.fontSize = block.fontSize ? `${block.fontSize}px` : '';
  el.style.fontFamily = cssFontFamily(block.fontFamily);
}
