/**
 * 导出用 HTML：把文档渲染成 Word/PDF 能接受的简单结构（纯函数，可单测）。
 */

import type { Block, Doc } from './types.js';
import { cssFontFamily, DEFAULT_FONT_FAMILY } from './font.js';
import { tableGrid } from './tableSpans.js';
import { renderChartSvg } from './chartSvg.js';
import { normalizeChart } from './chart.js';

const escape = (value: string): string => value
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const escapeAttr = (value: string): string => escape(value).replaceAll('"', '&quot;');

function blockHtml(block: Block): string {
  switch (block.type) {
    case 'table': {
      const grid = tableGrid(block);
      const body = grid.rows.map((cells, rowIndex) => {
        const tag = (block.meta?.header ?? false) && rowIndex === 0 ? 'th' : 'td';
        return `<tr>${cells.map((cell, columnIndex) => {
          const span = grid.spans?.[rowIndex]?.[columnIndex];
          if (grid.spans && !span) return '';
          const align = block.meta?.cellAligns?.[rowIndex]?.[columnIndex];
          const style = align ? ` style="text-align:${align}"` : '';
          const attrs = `${span && span.rowSpan > 1 ? ` rowspan="${span.rowSpan}"` : ''}${span && span.colSpan > 1 ? ` colspan="${span.colSpan}"` : ''}`;
          return `<${tag}${attrs}${style}>${block.meta?.richText ? cell : escape(cell)}</${tag}>`;
        }).join('')}</tr>`;
      }).join('');
      return `<table border="1" cellspacing="0" cellpadding="6" style="border-collapse:collapse;width:100%">${body}</table>`;
    }
    case 'image': {
      const src = block.meta?.src ?? '';
      if (!src) return '';
      return `<p><img src="${escapeAttr(src)}" style="width:${block.meta?.width ?? 100}%" /></p>`;
    }
    case 'divider':
      return '<hr />';
    case 'chart': {
      const chart = normalizeChart(block.meta?.chart);
      return `<figure>${chart.title ? `<figcaption>${escape(chart.title)}</figcaption>` : ''}${renderChartSvg(chart)}</figure>`;
    }
    case 'quote':
      return `<blockquote style="margin:0 0 0 12px;padding-left:12px;border-left:2px solid #cccccc">${block.html || ''}</blockquote>`;
    case 'bullet':
      return `<ul><li>${block.html || ''}</li></ul>`;
    case 'number':
      return `<ol><li>${block.html || ''}</li></ol>`;
    default: {
      const style = [
        block.align ? `text-align:${block.align}` : '',
        block.fontSize ? `font-size:${block.fontSize}pt` : '',
        block.fontFamily ? `font-family:${escapeAttr(cssFontFamily(block.fontFamily))}` : '',
        block.indent ? `margin-left:${block.indent * 24}px` : '',
      ].filter(Boolean).join(';');
      return `<p${style ? ` style="${style}"` : ''}>${block.html || '&nbsp;'}</p>`;
    }
  }
}

export function docToExportHtml(doc: Doc, pageCss = 'A4'): string {
  const body = doc.blocks.map(blockHtml).join('\n');
  return `<!doctype html><html><head><meta charset="utf-8" /><style>
  @page { size: ${pageCss}; margin: 20mm; }
  body { font-family: "${DEFAULT_FONT_FAMILY}", sans-serif; font-size: 16px; line-height: 1.7; color: #1f1f1f; }
  h1 { font-size: 20px; }
  table { font-size: 12px; }
  </style></head><body><h1>${escape(doc.title)}</h1>${body}</body></html>`;
}
