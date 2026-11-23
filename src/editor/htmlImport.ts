/**
 * Word（docx）导入：主进程用 mammoth 转成 HTML，这里把 HTML 转成块。
 * 只保留文本结构（段落/标题/列表/引用/表格/图片），样式尽量简化。
 */

import type { Block } from '../core/types.js';
import { createBlock } from '../core/types.js';
import { sanitizeInline } from '../editor/sanitize.js';

function textInline(el: Element): string {
  return sanitizeInline(el.innerHTML || '');
}

export function blocksFromHtml(html: string): Block[] {
  const template = document.createElement('template');
  template.innerHTML = html;
  const blocks: Block[] = [];
  const body = template.content;

  const visit = (node: ChildNode): void => {
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as HTMLElement;
    const tag = el.tagName.toLowerCase();
    switch (tag) {
      case 'h1':
      case 'h2':
      case 'h3':
      case 'h4':
      case 'h5':
      case 'h6': {
        const size = tag === 'h1' ? 20 : tag === 'h2' ? 17 : 15;
        blocks.push({ ...createBlock('paragraph'), html: `<b>${textInline(el)}</b>`, fontSize: size });
        break;
      }
      case 'p': {
        const html = textInline(el);
        if (html.trim()) blocks.push({ ...createBlock('paragraph'), html });
        break;
      }
      case 'ul':
      case 'ol': {
        const type = tag === 'ul' ? 'bullet' : 'number';
        for (const li of [...el.children]) {
          blocks.push({ ...createBlock(type), html: textInline(li) });
        }
        break;
      }
      case 'blockquote': {
        blocks.push({ ...createBlock('quote'), html: textInline(el) });
        break;
      }
      case 'table': {
        const rows: string[][] = [];
        for (const tr of [...el.querySelectorAll('tr')]) {
          const cells = [...tr.children].map((cell) => sanitizeInline(cell.innerHTML || '').trim());
          if (cells.length) rows.push(cells);
        }
        if (rows.length) blocks.push({ ...createBlock('table'), meta: { rows, header: true, richText: true } });
        break;
      }
      case 'img': {
        const src = el.getAttribute('src') ?? '';
        if (src) blocks.push({ ...createBlock('image'), meta: { src, width: 100 } });
        break;
      }
      case 'hr': {
        blocks.push({ ...createBlock('divider') });
        break;
      }
      default: {
        for (const child of [...el.childNodes]) visit(child);
      }
    }
  };

  for (const child of [...body.childNodes]) visit(child);
  if (!blocks.length) blocks.push({ ...createBlock('paragraph') });
  return blocks;
}
