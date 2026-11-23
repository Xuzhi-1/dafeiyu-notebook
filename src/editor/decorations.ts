/**
 * 块上的标记徽章。注释图标由 features/comments/decorations 负责。
 */

import type { Mark } from '../core/types.js';
import { markGlyph } from '../core/markGlyph.js';

export interface BlockDecoration {
  readonly mark?: Mark;
  readonly groupMark?: Mark;
  readonly groupMarkHead?: boolean;
  readonly groupMarkTail?: boolean;
}

export function decorateBlock(el: HTMLElement, decoration: BlockDecoration): void {
  el.querySelectorAll(':scope > .block-badge').forEach((node) => node.remove());
  el.classList.toggle('has-group-mark', Boolean(decoration.groupMark));
  el.classList.toggle('group-mark-first', Boolean(decoration.groupMark && decoration.groupMarkHead));
  el.classList.toggle('group-mark-last', Boolean(decoration.groupMark && decoration.groupMarkTail));
  if (decoration.groupMark?.color) {
    el.style.setProperty('--group-mark-color', decoration.groupMark.color);
  } else {
    el.style.removeProperty('--group-mark-color');
  }

  if (!decoration.mark) return;
  const badge = document.createElement('span');
  badge.className = 'block-badge';
  if (decoration.groupMarkHead) badge.classList.add('block-badge-group');
  badge.dataset.markBadge = '1';
  badge.title = decoration.mark.label || (decoration.mark.kind === 'focus' ? '重点' : '标记');
  if (decoration.mark.color) badge.style.color = decoration.mark.color;
  if (decoration.mark.image) {
    const img = document.createElement('img');
    img.src = decoration.mark.image;
    img.alt = badge.title;
    img.className = 'block-badge-image';
    badge.appendChild(img);
  } else {
    const glyph = markGlyph(decoration.mark);
    const shape = decoration.mark.shape ?? 'circle';
    const dot = document.createElement('span');
    dot.className = `block-badge-shape shape-${shape}`;
    dot.textContent = glyph;
    badge.appendChild(dot);
  }
  el.appendChild(badge);
}
