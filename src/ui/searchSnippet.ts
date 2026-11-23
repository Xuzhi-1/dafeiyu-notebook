/**
 * 搜索结果摘要：把正文 HTML 的命中范围转成带颜色、高亮和命中标记的片段。
 * 只负责“文本 → 摘要 HTML”，不依赖 store、分页或搜索面板。
 */

import { SEARCH_SNIPPET_AFTER, SEARCH_SNIPPET_BEFORE } from '../core/search.js';

type HighlightMode = 'marker' | 'solid' | 'wavy' | 'dashed';

interface TextPos {
  readonly node: Text;
  readonly start: number;
}

interface Run {
  text: string;
  color?: string;
  highlightMode?: HighlightMode;
  highlightColor?: string;
  match?: boolean;
}

function escapeHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function escapeAttr(value: string): string {
  return escapeHtml(value).replaceAll('"', '&quot;');
}

function colorOf(node: Node | null): string | undefined {
  let cursor = node instanceof Element ? node : node?.parentElement ?? null;
  while (cursor) {
    if (cursor instanceof HTMLElement && cursor.style.color) return cursor.style.color;
    cursor = cursor.parentElement;
  }
  return undefined;
}

function highlightOf(node: Node | null): { mode?: HighlightMode; color?: string } {
  const element = node instanceof Element ? node : node?.parentElement ?? null;
  const highlightEl = element?.closest<HTMLElement>('[data-highlight]');
  const mode = highlightEl?.dataset.highlight;
  if (mode !== 'marker' && mode !== 'solid' && mode !== 'wavy' && mode !== 'dashed') return {};
  const color = mode === 'marker'
    ? highlightEl?.style.backgroundColor
    : highlightEl?.style.textDecorationColor;
  return { mode, ...(color ? { color } : {}) };
}

function sameRun(a: Run, color: string | undefined, highlight: { mode?: HighlightMode; color?: string }, match: boolean): boolean {
  return a.color === color && a.highlightMode === highlight.mode && a.highlightColor === highlight.color && a.match === match;
}

function colorRunsHtml(nodes: readonly TextPos[], start: number, end: number, matchStart: number, matchEnd: number): string {
  const runs: Run[] = [];
  for (const item of nodes) {
    const nodeEnd = item.start + item.node.data.length;
    const from = Math.max(start, item.start);
    const to = Math.min(end, nodeEnd);
    if (to <= from) continue;
    const color = colorOf(item.node.parentElement);
    const highlight = highlightOf(item.node.parentElement);
    const cuts = [from, to];
    if (matchStart > from && matchStart < to) cuts.push(matchStart);
    if (matchEnd > from && matchEnd < to) cuts.push(matchEnd);
    cuts.sort((a, b) => a - b);
    for (let index = 0; index < cuts.length - 1; index += 1) {
      const segmentStart = cuts[index];
      const segmentEnd = cuts[index + 1];
      if (segmentEnd <= segmentStart) continue;
      const text = item.node.data.slice(segmentStart - item.start, segmentEnd - item.start);
      const isMatch = segmentStart >= matchStart && segmentEnd <= matchEnd;
      const last = runs[runs.length - 1];
      if (last && sameRun(last, color, highlight, isMatch)) last.text += text;
      else runs.push({ text, color, highlightMode: highlight.mode, highlightColor: highlight.color, match: isMatch });
    }
  }
  return runs.map((run) => {
    const style = [
      run.color ? `color:${escapeAttr(run.color)}` : '',
      run.highlightColor ? `--search-hl-color:${escapeAttr(run.highlightColor)}` : '',
    ].filter(Boolean).join(';');
    const classes = [
      run.color || run.highlightMode ? 'search-hit-rich' : '',
      run.match ? 'search-hit-match' : '',
    ].filter(Boolean).join(' ');
    if (!classes) return escapeHtml(run.text);
    const mode = run.highlightMode ? ` data-highlight="${run.highlightMode}"` : '';
    return `<span class="${classes}"${mode}${style ? ` style="${style}"` : ''}>${escapeHtml(run.text)}</span>`;
  }).join('');
}

export function highlightSearchMatchHtml(html: string, query: string): string {
  const keyword = query.trim().toLowerCase();
  if (!keyword) return html;
  const template = document.createElement('template');
  template.innerHTML = html;
  const walker = document.createTreeWalker(template.content, NodeFilter.SHOW_TEXT);
  const nodes: TextPos[] = [];
  let full = '';
  let current = walker.nextNode();
  while (current) {
    const text = current as Text;
    nodes.push({ node: text, start: full.length });
    full += text.data;
    current = walker.nextNode();
  }
  const index = full.toLowerCase().indexOf(keyword);
  if (index < 0) return html;
  const end = index + keyword.length;
  for (let i = nodes.length - 1; i >= 0; i -= 1) {
    const item = nodes[i];
    const nodeStart = item.start;
    const nodeEnd = nodeStart + item.node.data.length;
    const from = Math.max(index, nodeStart);
    const to = Math.min(end, nodeEnd);
    if (to <= from) continue;
    let text = item.node;
    const localTo = to - nodeStart;
    const localFrom = from - nodeStart;
    if (localTo < text.data.length) text.splitText(localTo);
    if (localFrom > 0) text = text.splitText(localFrom);
    const span = document.createElement('span');
    span.className = 'search-hit-match';
    text.parentNode?.replaceChild(span, text);
    span.appendChild(text);
  }
  return template.innerHTML;
}

export function buildSearchSnippetHtml(blockHtml: string, query: string): string {
  const keyword = query.trim().toLowerCase();
  if (!keyword) return '';
  const template = document.createElement('template');
  template.innerHTML = blockHtml;
  const walker = document.createTreeWalker(template.content, NodeFilter.SHOW_TEXT);
  const nodes: TextPos[] = [];
  let full = '';
  let current = walker.nextNode();
  while (current) {
    const text = current as Text;
    nodes.push({ node: text, start: full.length });
    full += text.data;
    current = walker.nextNode();
  }
  const index = full.toLowerCase().indexOf(keyword);
  if (index < 0) return '';
  const end = index + keyword.length;
  const start = Math.max(0, index - SEARCH_SNIPPET_BEFORE);
  const finish = Math.min(full.length, end + SEARCH_SNIPPET_AFTER);
  const prefix = start > 0 ? '…' : '';
  const suffix = finish < full.length ? '…' : '';
  return `${prefix}${colorRunsHtml(nodes, start, finish, index, end)}${suffix}`;
}
