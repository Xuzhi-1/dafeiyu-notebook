import type { SearchRail } from './searchGroups.js';

export interface SearchRailPaintOptions {
  readonly results: HTMLElement;
  readonly start: number;
  readonly visibleCount: number;
  readonly layerClass: string;
  readonly lineClass: string;
  readonly spacerSelector: string;
  readonly colorProperty: string;
  readonly linePosition?: 'center' | 'after';
  readonly rails: readonly SearchRail[];
}

/** 把组范围线画成覆盖多行的单条线，不参与命中行布局。 */
export function paintSearchRails(options: SearchRailPaintOptions): void {
  const { results, start, visibleCount, rails } = options;
  if (!rails.length || !visibleCount) return;
  const resultsRect = results.getBoundingClientRect();
  const rows = [...results.querySelectorAll<HTMLElement>(':scope > .search-hit')];
  const layer = document.createElement('div');
  layer.className = options.layerClass;
  layer.style.height = `${results.scrollHeight}px`;

  for (const rail of rails) {
    const from = Math.max(rail.first, start);
    const to = Math.min(rail.last, start + visibleCount - 1);
    if (from > to) continue;
    const firstEl = rows[from - start];
    const lastEl = rows[to - start];
    const anchor = firstEl?.querySelector<HTMLElement>(options.spacerSelector);
    if (!firstEl || !lastEl || !anchor) continue;
    const anchorRect = anchor.getBoundingClientRect();
    const top = firstEl.getBoundingClientRect().top - resultsRect.top + results.scrollTop + 4;
    const bottom = lastEl.getBoundingClientRect().bottom - resultsRect.top + results.scrollTop - 4;
    if (bottom <= top) continue;

    const line = document.createElement('span');
    line.className = options.lineClass;
    const lineLeft = options.linePosition === 'after'
      ? anchorRect.right - resultsRect.left + 2
      : anchorRect.left - resultsRect.left + anchorRect.width / 2;
    line.style.left = `${lineLeft}px`;
    line.style.top = `${top}px`;
    line.style.height = `${bottom - top}px`;
    if (rail.color) line.style.setProperty(options.colorProperty, rail.color);
    layer.appendChild(line);
  }

  if (layer.childElementCount) results.appendChild(layer);
}
