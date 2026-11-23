/** 组标记范围线：每个组一条覆盖线，跨越组内注释和块间距。 */

import type { Doc, MarkAnnotation } from '../../core/types.js';
import { clientToLocal } from '../../editor/geometry.js';

function blockOf(host: HTMLElement, id: string): HTMLElement | null {
  return host.querySelector<HTMLElement>(`.block[data-id="${id}"]`);
}

/** 重绘全部组标记范围线。 */
export function paintGroupMarkOverlay(host: HTMLElement, doc: Doc): void {
  host.querySelectorAll(':scope > .group-mark-line').forEach((line) => line.remove());
  const order = new Map(doc.blocks.map((block, index) => [block.id, index]));
  const groups = new Map<string, MarkAnnotation>();
  for (const annotation of doc.annotations) {
    if (annotation.type !== 'mark' || !annotation.anchor.blockIds?.length) continue;
    const ids = [...new Set(annotation.anchor.blockIds)]
      .filter((id) => order.has(id))
      .sort((a, b) => order.get(a)! - order.get(b)!);
    if (ids.length < 2) continue;
    groups.set(ids.join('|'), { ...annotation, anchor: { blockId: ids[0], blockIds: ids } });
  }

  for (const [key, note] of groups) {
    const ids = note.anchor.blockIds ?? [];
    const blocks = ids.map((id) => blockOf(host, id)).filter((el): el is HTMLElement => Boolean(el));
    if (blocks.length < 2) continue;
    const first = blocks[0];
    const last = blocks[blocks.length - 1];
    const firstRect = first.getBoundingClientRect();
    const lastRect = last.getBoundingClientRect();
    const style = getComputedStyle(first);
    const borderLeft = Number.parseFloat(style.borderLeftWidth) || 0;
    const gap = Number.parseFloat(style.getPropertyValue('--gutter-gap')) || 8;
    const lineWidth = Number.parseFloat(style.getPropertyValue('--gutter-line-width')) || 2;
    const lineLeft = -(gap + lineWidth);
    const gutterBorder = Number.parseFloat(style.getPropertyValue('--gutter-border-left')) || 0;
    const x = clientToLocal(host, firstRect.left, 0).x + borderLeft + lineLeft - gutterBorder;
    const top = clientToLocal(host, 0, firstRect.top).y + 4;
    const bottom = clientToLocal(host, 0, lastRect.bottom).y - 4;
    if (bottom <= top) continue;

    const line = document.createElement('div');
    line.className = 'group-mark-line';
    line.dataset.groupMark = key;
    line.style.setProperty('--group-mark-color', note.mark.color || '#ED7D31');
    line.style.left = `${x}px`;
    line.style.top = `${top}px`;
    line.style.height = `${bottom - top}px`;
    host.appendChild(line);
  }
}
