/**
 * 分割线块视图。
 */

import type { Block } from '../../core/types.js';

export function createDividerView(block: Block): HTMLElement {
  const el = document.createElement('div');
  el.className = 'block block-divider';
  el.dataset.id = block.id;
  return el;
}
