import type { Block } from '../../core/types.js';
import { normalizeChart } from '../../core/chart.js';
import { renderChartSvg } from '../../core/chartSvg.js';

export function createChartView(block: Block): HTMLElement {
  const el = document.createElement('div');
  el.className = 'block block-chart';
  el.dataset.id = block.id;
  el.innerHTML = chartMarkup(block);
  return el;
}

function chartMarkup(block: Block): string {
  const spec = normalizeChart(block.meta?.chart);
  return `<div class="chart-card">${spec.title ? `<div class="chart-title">${escape(spec.title)}</div>` : ''}${renderChartSvg(spec)}</div>`;
}

export function updateChartView(el: HTMLElement, block: Block, previous: Block | undefined): void {
  if (previous?.meta?.chart === block.meta?.chart) return;
  el.innerHTML = chartMarkup(block);
}

const escape = (value: string): string => value
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;');
