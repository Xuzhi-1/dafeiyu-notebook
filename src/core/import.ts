/**
 * 纯文本 / Markdown → 块（纯函数，可单测）。
 * 标题 1–3 已取消：Markdown 的 # 标题转成加粗段落并保留较大字号。
 */

import type { Block } from './types.js';
import { createBlock } from './types.js';

const escapeHtml = (value: string): string => value
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');

function inline(markdown: string): string {
  let html = escapeHtml(markdown);
  html = html.replace(/`([^`]+)`/g, '<span style="font-family:monospace">$1</span>');
  html = html.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" rel="noreferrer">$1</a>');
  html = html.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
  html = html.replace(/(^|[^*])\*([^*]+)\*/g, '$1<i>$2</i>');
  return html;
}

export function blocksFromText(content: string): Block[] {
  const lines = content.replace(/\r\n?/g, '\n').split('\n');
  const blocks: Block[] = [];
  let paragraph: string[] = [];

  const flush = (): void => {
    if (!paragraph.length) return;
    const text = paragraph.join(' ').trim();
    paragraph = [];
    if (text) blocks.push({ ...createBlock('paragraph'), html: inline(text) });
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (!line.trim()) { flush(); continue; }
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      flush();
      const level = heading[1].length;
      const size = level <= 1 ? 20 : level === 2 ? 17 : 15;
      blocks.push({ ...createBlock('paragraph'), html: `<b>${inline(heading[2])}</b>`, fontSize: size });
      continue;
    }
    if (/^\s*[-*+]\s+/.test(line)) {
      flush();
      blocks.push({ ...createBlock('bullet'), html: inline(line.replace(/^\s*[-*+]\s+/, '')) });
      continue;
    }
    if (/^\s*\d+[.)]\s+/.test(line)) {
      flush();
      blocks.push({ ...createBlock('number'), html: inline(line.replace(/^\s*\d+[.)]\s+/, '')) });
      continue;
    }
    if (/^\s*>\s?/.test(line)) {
      flush();
      blocks.push({ ...createBlock('quote'), html: inline(line.replace(/^\s*>\s?/, '')) });
      continue;
    }
    if (/^\s*---+\s*$/.test(line)) {
      flush();
      blocks.push({ ...createBlock('divider') });
      continue;
    }
    paragraph.push(line.trim());
  }
  flush();
  if (!blocks.length) blocks.push({ ...createBlock('paragraph') });
  return blocks;
}
