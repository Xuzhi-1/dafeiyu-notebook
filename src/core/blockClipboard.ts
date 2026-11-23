/** 区块剪贴板：序列化到系统剪贴板，避免依赖进程内状态。 */

import type { Annotation, Block } from './types.js';
import { tableGrid } from './tableSpans.js';
import { renderChartSvg } from './chartSvg.js';
import { normalizeChart } from './chart.js';

interface BlockClipboardData {
  v: 1;
  blocks: readonly Block[];
  annotations: readonly Annotation[];
}

export interface BlockClipboardContent {
  text: string;
  html: string;
}

const MARKER = 'data-dafeiyu-blocks';
const MAX_HTML = 32 * 1024 * 1024;
const MAX_BLOCKS = 5000;
const MAX_ANNOTATIONS = 10000;
const BLOCK_TYPES = new Set(['paragraph', 'quote', 'bullet', 'number', 'table', 'image', 'divider', 'chart']);
const BLOCK_ID = /^[A-Za-z0-9_-]{1,80}$/;

const escapeHtml = (value: string): string => value
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;');

const escapeAttr = (value: string): string => escapeHtml(value).replaceAll('"', '&quot;');

function htmlText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|tr|h[1-6])>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function blockText(block: Block): string {
  switch (block.type) {
    case 'table':
      return (block.meta?.rows ?? []).map((row) => row.join('\t')).join('\n');
    case 'image':
      return '[图片]';
    case 'divider':
      return '---';
    case 'chart': {
      const chart = normalizeChart(block.meta?.chart);
      return [chart.title, ...chart.categories.map((category, index) => `${category}: ${chart.series.map((series) => series.values[index] ?? 0).join(', ')}`)].filter(Boolean).join('\n');
    }
    default:
      return htmlText(block.html);
  }
}

function blockHtml(block: Block): string {
  switch (block.type) {
    case 'table': {
      const grid = tableGrid(block);
      const rows = grid.rows.map((row, rowIndex) => {
        const cells = row.map((cell, columnIndex) => {
          const span = grid.spans?.[rowIndex]?.[columnIndex];
          if (grid.spans && !span) return '';
          const value = block.meta?.richText ? cell : escapeHtml(cell);
          const attrs = `${span && span.rowSpan > 1 ? ` rowspan="${span.rowSpan}"` : ''}${span && span.colSpan > 1 ? ` colspan="${span.colSpan}"` : ''}`;
          return `<td${attrs}>${value}</td>`;
        }).join('');
        return `<tr>${cells}</tr>`;
      }).join('');
      return `<table border="1" cellspacing="0" cellpadding="6" style="border-collapse:collapse">${rows}</table>`;
    }
    case 'image':
      return block.meta?.src
        ? `<p><img src="${escapeAttr(block.meta.src)}" style="width:${block.meta.width ?? 100}%" /></p>`
        : '';
    case 'divider':
      return '<hr />';
    case 'chart': {
      const chart = normalizeChart(block.meta?.chart);
      return `<figure>${chart.title ? `<figcaption>${escapeHtml(chart.title)}</figcaption>` : ''}${renderChartSvg(chart)}</figure>`;
    }
    case 'quote':
      return `<blockquote>${block.html || ''}</blockquote>`;
    case 'bullet':
      return `<ul><li>${block.html || ''}</li></ul>`;
    case 'number':
      return `<ol><li>${block.html || ''}</li></ol>`;
    default:
      return `<p>${block.html || '&nbsp;'}</p>`;
  }
}

export function encodeBlockClipboard(
  blocks: readonly Block[],
  annotations: readonly Annotation[],
): BlockClipboardContent {
  const payload: BlockClipboardData = { v: 1, blocks, annotations };
  const marker = encodeURIComponent(JSON.stringify(payload));
  const text = blocks.map(blockText).filter(Boolean).join('\n\n');
  const html = `<div ${MARKER}="${marker}" style="display:none"></div>${blocks.map(blockHtml).join('')}`;
  return { text: text || ' ', html };
}

export function decodeBlockClipboard(html: string): BlockClipboardData | null {
  if (!html) return null;
  const match = html.match(new RegExp(`${MARKER}="([^"]+)"`));
  if (!match) return null;
  try {
    const value = JSON.parse(decodeURIComponent(match[1]));
    if (html.length > MAX_HTML || value?.v !== 1
      || !Array.isArray(value.blocks) || !value.blocks.length || value.blocks.length > MAX_BLOCKS) return null;
    const ids = new Set<string>();
    if (!value.blocks.every((block: unknown) => {
      if (!block || typeof block !== 'object') return false;
      const candidate = block as Block;
      if (!BLOCK_ID.test(candidate.id)
        || !BLOCK_TYPES.has(candidate.type)
        || typeof candidate.html !== 'string'
        || candidate.html.length > MAX_HTML
        || ids.has(candidate.id)) return false;
      if (candidate.type === 'table') {
        const rows = candidate.meta?.rows;
        if (!Array.isArray(rows)
          || !rows.every((row) => Array.isArray(row) && row.every((cell) => typeof cell === 'string'))) return false;
      }
      ids.add(candidate.id);
      return true;
    })) return null;
    const annotations = Array.isArray(value.annotations) ? value.annotations : [];
    if (annotations.length > MAX_ANNOTATIONS || !annotations.every((annotation: unknown) => {
      if (!annotation || typeof annotation !== 'object') return false;
      const item = annotation as Annotation;
      return typeof item.id === 'string'
        && (item.type === 'mark' || item.type === 'comment')
        && Boolean(item.anchor) && typeof item.anchor.blockId === 'string';
    })) return null;
    return { v: 1, blocks: value.blocks, annotations };
  } catch {
    return null;
  }
}
