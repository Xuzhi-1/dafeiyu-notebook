import type { ChartSpec } from './types.js';
import { normalizeChart } from './chart.js';

const WIDTH = 640;
const HEIGHT = 320;
const COLORS = ['#4d6bfe', '#e07a5f', '#3c9b68', '#b07cc6', '#d19a3e', '#4d9ab8'];

const escape = (value: string): string => value
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;');

function niceMax(value: number): number {
  if (value <= 0) return 1;
  const power = 10 ** Math.floor(Math.log10(value));
  const unit = value / power;
  const step = unit <= 1 ? 1 : unit <= 2 ? 2 : unit <= 5 ? 5 : 10;
  return step * power;
}

function text(value: string, x: number, y: number, attrs = ''): string {
  return `<text x="${x}" y="${y}" ${attrs}>${escape(value)}</text>`;
}

function legendLayout(spec: ChartSpec): { markup: string; height: number } {
  const columns = Math.min(4, Math.max(1, spec.series.length));
  const rows = Math.ceil(spec.series.length / columns);
  const markup = spec.series.map((item, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const x = 18 + column * 130;
    const y = 12 + row * 18;
    return `<rect x="${x}" y="${y}" width="9" height="9" rx="2" fill="${COLORS[index % COLORS.length]}"/>`
      + text(item.name, x + 13, y + 8, 'font-size="11" fill="#6f665a"');
  }).join('');
  return { markup, height: rows * 18 };
}

function emptySvg(): string {
  return `<svg class="chart-svg" width="100%" height="320" viewBox="0 0 ${WIDTH} ${HEIGHT}" role="img" aria-label="暂无图表数据"><rect width="${WIDTH}" height="${HEIGHT}" fill="transparent"/>${text('暂无图表数据', WIDTH / 2, HEIGHT / 2, 'text-anchor="middle" font-size="14" fill="#9a9186"')}</svg>`;
}

function barSvg(spec: ChartSpec): string {
  const values = spec.series.flatMap((item) => item.values);
  const max = niceMax(Math.max(1, ...values));
  const legendInfo = legendLayout(spec);
  const left = 48;
  const right = 20;
  const top = 42 + Math.max(0, legendInfo.height - 18);
  const bottom = 282;
  const plotWidth = WIDTH - left - right;
  const plotHeight = bottom - top;
  const groupWidth = plotWidth / Math.max(1, spec.categories.length);
  const barWidth = Math.min(28, (groupWidth * 0.72) / Math.max(1, spec.series.length));
  const lines = Array.from({ length: 5 }, (_, index) => {
    const y = top + (plotHeight * index) / 4;
    const value = (max * (4 - index)) / 4;
    return `<line x1="${left}" y1="${y}" x2="${WIDTH - right}" y2="${y}" stroke="#eee9e1"/>`
      + text(String(Math.round(value)).slice(0, 7), left - 8, y + 3, 'text-anchor="end" font-size="10" fill="#9a9186"');
  }).join('');
  const bars = spec.categories.map((category, categoryIndex) => {
    const groupX = left + categoryIndex * groupWidth + groupWidth * 0.14;
    const label = text(category.length > 8 ? `${category.slice(0, 8)}…` : category, groupX + groupWidth * 0.36, bottom + 18, 'text-anchor="middle" font-size="10" fill="#6f665a"');
    const rects = spec.series.map((series, seriesIndex) => {
      const value = Math.max(0, series.values[categoryIndex] ?? 0);
      const height = (value / max) * plotHeight;
      return `<rect x="${groupX + seriesIndex * barWidth}" y="${bottom - height}" width="${Math.max(1, barWidth - 2)}" height="${height}" rx="2" fill="${COLORS[seriesIndex % COLORS.length]}"/>`;
    }).join('');
    return label + rects;
  }).join('');
  return `<svg class="chart-svg" width="100%" height="320" viewBox="0 0 ${WIDTH} ${HEIGHT}" role="img" aria-label="${escape(spec.title || '柱状图')}"><rect width="${WIDTH}" height="${HEIGHT}" fill="transparent"/>${lines}${bars}${legendInfo.markup}</svg>`;
}

function lineSvg(spec: ChartSpec): string {
  const values = spec.series.flatMap((item) => item.values);
  const max = niceMax(Math.max(1, ...values));
  const legendInfo = legendLayout(spec);
  const left = 48;
  const right = 20;
  const top = 42 + Math.max(0, legendInfo.height - 18);
  const bottom = 282;
  const plotWidth = WIDTH - left - right;
  const plotHeight = bottom - top;
  const step = plotWidth / Math.max(1, spec.categories.length - 1);
  const lines = Array.from({ length: 5 }, (_, index) => {
    const y = top + (plotHeight * index) / 4;
    const value = (max * (4 - index)) / 4;
    return `<line x1="${left}" y1="${y}" x2="${WIDTH - right}" y2="${y}" stroke="#eee9e1"/>`
      + text(String(Math.round(value)).slice(0, 7), left - 8, y + 3, 'text-anchor="end" font-size="10" fill="#9a9186"');
  }).join('');
  const labels = spec.categories.map((category, index) => (
    text(category.length > 8 ? `${category.slice(0, 8)}…` : category, left + index * step, bottom + 18, 'text-anchor="middle" font-size="10" fill="#6f665a"')
  )).join('');
  const paths = spec.series.map((series, seriesIndex) => {
    const points = series.values.map((value, index) => {
      const x = left + index * step;
      const y = bottom - (Math.max(0, value) / max) * plotHeight;
      return `${x},${y}`;
    }).join(' ');
    const dots = series.values.map((value, index) => (
      `<circle cx="${left + index * step}" cy="${bottom - (Math.max(0, value) / max) * plotHeight}" r="3" fill="${COLORS[seriesIndex % COLORS.length]}"/>`
    )).join('');
    return `<polyline points="${points}" fill="none" stroke="${COLORS[seriesIndex % COLORS.length]}" stroke-width="2"/>${dots}`;
  }).join('');
  return `<svg class="chart-svg" width="100%" height="320" viewBox="0 0 ${WIDTH} ${HEIGHT}" role="img" aria-label="${escape(spec.title || '折线图')}"><rect width="${WIDTH}" height="${HEIGHT}" fill="transparent"/>${lines}${labels}${paths}${legendInfo.markup}</svg>`;
}

function pieSvg(spec: ChartSpec): string {
  const series = spec.series[0];
  const values = series?.values.map((value) => Math.max(0, value)) ?? [];
  const total = values.reduce((sum, value) => sum + value, 0);
  if (!total) return emptySvg();
  const cx = 220;
  const cy = 178;
  const radius = 112;
  let start = -Math.PI / 2;
  const slices = values.map((value, index) => {
    const angle = (value / total) * Math.PI * 2;
    const end = start + angle;
    const x1 = cx + Math.cos(start) * radius;
    const y1 = cy + Math.sin(start) * radius;
    const x2 = cx + Math.cos(end) * radius;
    const y2 = cy + Math.sin(end) * radius;
    const large = angle > Math.PI ? 1 : 0;
    const path = `M ${cx} ${cy} L ${x1} ${y1} A ${radius} ${radius} 0 ${large} 1 ${x2} ${y2} Z`;
    const label = text(spec.categories[index] ?? '', 420, 95 + index * 24, 'font-size="11" fill="#6f665a"');
    const swatch = `<rect x="402" y="${86 + index * 24}" width="9" height="9" rx="2" fill="${COLORS[index % COLORS.length]}"/>`;
    start = end;
    return `<path d="${path}" fill="${COLORS[index % COLORS.length]}"/>${swatch}${label}`;
  }).join('');
  return `<svg class="chart-svg" width="100%" height="320" viewBox="0 0 ${WIDTH} ${HEIGHT}" role="img" aria-label="${escape(spec.title || '饼图')}"><rect width="${WIDTH}" height="${HEIGHT}" fill="transparent"/>${slices}</svg>`;
}

export function renderChartSvg(specValue: unknown): string {
  const spec = normalizeChart(specValue);
  if (!spec.categories.length || !spec.series.length) return emptySvg();
  if (spec.kind === 'line') return lineSvg(spec);
  if (spec.kind === 'pie') return pieSvg(spec);
  return barSvg(spec);
}
