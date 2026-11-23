/**
 * 搜索面板：输入关键词，列出命中（正文/注释），点击跳转。
 * 输入框只构建一次，输入时只更新结果列表（不丢焦点）。
 */

import type { Store } from '../core/store.js';
import { searchDoc, type SearchCell, type SearchCommentPort, type SearchHit } from '../core/search.js';
import type { Block, CommentAnnotation } from '../core/types.js';
import { tableCellHtml } from '../core/table.js';
import { markGlyph, searchMetaFor, type SearchMeta } from './searchMeta.js';
import { buildSearchSnippetHtml, highlightSearchMatchHtml } from './searchSnippet.js';
import { iconSvg } from './icons.js';
import { buildSearchGroups, type SearchGroups } from './searchGroups.js';
import { paintSearchRails } from './searchRails.js';
import { t } from '../i18n/index.js';

export interface SearchPanelOptions {
  externalInput?: HTMLInputElement;
  comments?: SearchCommentPort;
}

export class SearchPanel {
  private readonly input: HTMLInputElement;
  private readonly results: HTMLElement;
  private readonly pager: HTMLElement;
  private readonly comments: SearchCommentPort;
  private readonly blocksById = new Map<string, Block>();
  private readonly notesById = new Map<string, CommentAnnotation>();
  private query = '';
  private hits: SearchHit[] = [];
  private groups: SearchGroups | null = null;
  private rendered = 0;
  private railState: { groups: SearchGroups; start: number; visibleCount: number } | null = null;
  private railFrame = 0;
  private updateTimer = 0;
  private static readonly CHUNK_SIZE = 100;
  private static readonly LOAD_MARGIN = 240;

  constructor(
    private readonly host: HTMLElement,
    private readonly store: Store,
    private readonly onJump: (blockId: string, cell?: SearchCell) => void,
    options: SearchPanelOptions = {},
  ) {
    this.comments = options.comments ?? FALLBACK_COMMENTS;
    const externalInput = options.externalInput;
    this.host.innerHTML = `
      ${externalInput ? '' : `<div class="search-head"><input class="search-input" placeholder="${t('搜索正文与注释…')}" /></div>`}
      <div class="search-results"></div>
      <div class="search-pager"></div>`;
    this.input = options.externalInput ?? this.host.querySelector<HTMLInputElement>('input')!;
    this.results = this.host.querySelector<HTMLElement>('.search-results')!;
    this.pager = this.host.querySelector<HTMLElement>('.search-pager')!;

    this.input.addEventListener('input', () => this.scheduleUpdate());
    this.results.addEventListener('click', (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const hit = target.closest<HTMLElement>('[data-search-block]');
      if (!hit?.dataset.searchBlock) return;
      const row = Number(hit.dataset.searchRow);
      const column = Number(hit.dataset.searchColumn);
      this.onJump(
        hit.dataset.searchBlock,
        Number.isInteger(row) && Number.isInteger(column) ? { row, column } : undefined,
      );
    });
    this.results.addEventListener('scroll', () => this.loadMore(), { passive: true });
    window.addEventListener('dfy:search-layout', () => this.scheduleRails());
    this.update('');
  }

  private scheduleUpdate(): void {
    window.clearTimeout(this.updateTimer);
    this.query = this.input.value;
    if (!this.query.trim()) {
      this.update('');
      return;
    }
    this.updateTimer = window.setTimeout(() => {
      this.updateTimer = 0;
      this.update(this.query);
    }, 90);
  }

  toggle(): void {
    if (!this.host.hidden) {
      this.close();
      return;
    }
    this.host.hidden = false;
    this.update(this.input.value);
    this.input.focus();
  }

  openWith(value: string): void {
    const needsUpdate = this.host.hidden || this.query !== value;
    this.host.hidden = false;
    this.input.value = value;
    this.query = value;
    if (needsUpdate) this.update(value);
  }

  close(): void {
    this.host.hidden = true;
    this.input.blur();
  }

  clear(): void {
    this.input.value = '';
    this.query = '';
    this.update('');
  }

  isOpen(): boolean {
    return !this.host.hidden;
  }

  contains(target: Node): boolean {
    return this.host.contains(target);
  }

  refresh(): void {
    if (!this.host.hidden) this.update(this.input.value);
  }

  /** 插件加载/切换后刷新层级。 */
  private scheduleRails(): void {
    if (this.host.hidden || !this.railState) return;
    cancelAnimationFrame(this.railFrame);
    this.railFrame = requestAnimationFrame(() => {
      if (!this.host.hidden && this.railState) this.paintRails();
    });
  }

  /** 同步文本区轨道宽度，并重绘类型、注释、标记三类范围线。 */
  private paintRails(): void {
    const groupLine = document.querySelector<HTMLElement>('.group-comment-line');
    const directLine = groupLine ? null : document.querySelector<HTMLElement>('.comment-line');
    const commentWidth = groupLine
      ? getComputedStyle(groupLine).borderRightWidth
      : directLine ? getComputedStyle(directLine).borderLeftWidth : '';
    const markLine = document.querySelector<HTMLElement>('.group-mark-line');
    if (commentWidth) this.results.style.setProperty('--search-comment-rail-width', commentWidth);
    else this.results.style.removeProperty('--search-comment-rail-width');
    if (markLine) this.results.style.setProperty('--search-mark-rail-width', getComputedStyle(markLine).width);
    else this.results.style.removeProperty('--search-mark-rail-width');
    this.results.querySelectorAll(':scope > .search-comment-rails, :scope > .search-mark-rails, :scope > .search-type-rails')
      .forEach((node) => node.remove());
    const state = this.railState;
    if (!state) return;
    paintSearchRails({
      results: this.results,
      start: state.start,
      visibleCount: state.visibleCount,
      layerClass: 'search-type-rails',
      lineClass: 'search-type-rail-line',
      spacerSelector: '.search-kind-icon, .search-kind-spacer',
      colorProperty: '--search-type-color',
      linePosition: 'after',
      rails: state.groups.typeRails,
    });
    paintSearchRails({
      results: this.results,
      start: state.start,
      visibleCount: state.visibleCount,
      layerClass: 'search-comment-rails',
      lineClass: 'search-comment-rail-line',
      spacerSelector: '.search-comment-range-spacer',
      colorProperty: '--search-comment-color',
      rails: state.groups.commentRails,
    });
    paintSearchRails({
      results: this.results,
      start: state.start,
      visibleCount: state.visibleCount,
      layerClass: 'search-mark-rails',
      lineClass: 'search-mark-rail-line',
      spacerSelector: '.search-mark-rail-spacer',
      colorProperty: '--search-mark-color',
      rails: state.groups.markRails,
    });
  }

  private loadMore(): void {
    if (this.host.hidden || this.rendered >= this.hits.length) return;
    const { scrollTop, clientHeight, scrollHeight } = this.results;
    if (scrollTop + clientHeight < scrollHeight - SearchPanel.LOAD_MARGIN) return;
    this.renderChunk();
  }

  /** 执行一次查询，重建结果索引，并重置分组、分页和轨道。 */
  private update(query: string): void {
    this.query = query;
    this.blocksById.clear();
    this.notesById.clear();
    for (const block of this.store.doc.blocks) this.blocksById.set(block.id, block);
    for (const note of this.store.doc.annotations) {
      if (note.type === 'comment') this.notesById.set(note.id, note);
    }
    this.hits = searchDoc(this.store.doc, query);
    this.rendered = 0;
    this.groups = null;
    this.railState = null;
    this.results.innerHTML = '';
    this.pager.innerHTML = '';
    if (!query.trim()) {
      this.results.innerHTML = `<p class="search-empty">${t('输入关键词开始搜索。')}</p>`;
      return;
    }
    if (!this.hits.length) {
      this.results.innerHTML = `<p class="search-empty">${t('没有找到相关内容。')}</p>`;
      return;
    }
    this.groups = buildSearchGroups(this.store.doc, this.hits, this.comments);
    this.renderChunk();
    this.results.scrollTop = 0;
  }

  private renderChunk(): void {
    if (!this.groups || this.rendered >= this.hits.length) return;
    const end = Math.min(this.hits.length, this.rendered + SearchPanel.CHUNK_SIZE);
    const html = this.hits.slice(this.rendered, end)
      .map((hit, offset) => this.renderHit(hit, this.rendered + offset))
      .join('');
    this.rendered = end;
    this.results.insertAdjacentHTML('beforeend', html);
    this.railState = { groups: this.groups, start: 0, visibleCount: this.rendered };
    this.paintRails();
    this.pager.innerHTML = `<span>${t('共 {count} 条', { count: this.hits.length })}</span>`;
  }

  /** 将一条命中渲染为结果行；列顺序必须与轨道占位保持一致。 */
  private renderHit(hit: SearchHit, absoluteIndex: number): string {
    const groups = this.groups;
    if (!groups) return '';
    const isNote = hit.kind === 'note';
    const meta = isNote ? undefined : groups.meta.get(hit.blockId) ?? searchMetaFor(this.store.doc, hit.blockId);
    const markKey = meta?.mark ? (meta.markGroupId ? `group:${meta.markGroupId}` : `block:${hit.blockId}`) : '';
    const mark = !isNote && meta?.mark
      ? groups.markFirst.get(markKey) === absoluteIndex
        ? renderMark(meta.mark)
        : '<span class="search-mark-spacer" aria-hidden="true"></span>'
      : '<span class="search-mark-spacer" aria-hidden="true"></span>';
    const note = isNote && hit.noteId ? this.notesById.get(hit.noteId) ?? null : null;
    const block = hit.kind === 'text' ? this.blocksById.get(hit.blockId) : null;
    let text = escapeHtml(hit.snippet);
    if (hit.kind === 'chart') {
      text = buildSearchSnippetHtml(escapeHtml(hit.snippet), this.query) || escapeHtml(hit.snippet);
    } else if (hit.kind === 'text' && block) {
      const source = hit.cell
        ? block.meta?.richText
          ? tableCellHtml(block, hit.cell.row, hit.cell.column) ?? ''
          : escapeHtml(tableCellHtml(block, hit.cell.row, hit.cell.column) ?? '')
        : block.html;
      text = buildSearchSnippetHtml(source, this.query) || escapeHtml(hit.snippet);
    } else if (note?.type === 'comment') {
      text = highlightSearchMatchHtml(this.comments.render(note), this.query);
    }
    const noteGroup = note?.type === 'comment' && note.anchor.blockIds?.length
      ? { id: note.id, color: note.color }
      : undefined;
    const group = isNote ? noteGroup : groups.commentMeta.get(hit.blockId);
    const direct = isNote && !noteGroup;
    const groupMarker = group ? groups.commentMarker.get(group.id) === absoluteIndex : false;
    const marker = group
      ? groupMarker
        ? `<span class="search-comment-marker is-dashed"${group.color ? ` style="--search-comment-color:${escapeAttr(group.color)}"` : ''} aria-hidden="true"></span>`
        : '<span class="search-comment-marker-spacer" aria-hidden="true"></span>'
      : direct
        ? `<span class="search-comment-marker"${note?.color ? ` style="--search-comment-color:${escapeAttr(note.color)}"` : ''} aria-hidden="true"></span>`
        : '<span class="search-comment-marker-spacer" aria-hidden="true"></span>';
    const typeKey = hit.cell ? `table:${hit.blockId}` : hit.kind === 'chart' ? `chart:${hit.blockId}` : '';
    const firstOfType = Boolean(typeKey) && groups.typeFirst.get(typeKey) === absoluteIndex;
    const type = hit.cell && firstOfType
      ? `<span class="search-kind-icon search-table-icon" title="${t('表格')}" aria-label="${t('表格')}">${iconSvg('table')}</span>`
      : hit.kind === 'chart' && firstOfType
        ? `<span class="search-kind-icon search-chart-icon" title="${t('图表')}" aria-label="${t('图表')}">${iconSvg('chart')}</span>`
        : '<span class="search-kind-spacer" aria-hidden="true"></span>';
    const cellAttrs = hit.cell
      ? ` data-search-row="${hit.cell.row}" data-search-column="${hit.cell.column}"`
      : '';
    return `<button type="button" class="search-hit" data-search-block="${escapeAttr(hit.blockId)}"${cellAttrs}>
        ${mark}
        <span class="search-mark-rail-spacer" aria-hidden="true"></span>
        ${marker}
        ${type}
        <span class="search-snippet">${text}</span>
        <span class="search-comment-range-spacer" aria-hidden="true"></span>
      </button>`;
  }
}

const FALLBACK_COMMENTS: SearchCommentPort = {
  render: (note) => escapeHtml(note.html),
  groupForBlock: () => undefined,
};


function escapeHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function escapeAttr(value: string): string {
  return escapeHtml(value).replaceAll('"', '&quot;');
}

function renderMark(mark: SearchMeta['mark']): string {
  if (!mark) return '';
  const title = mark.label || t('标记');
  if (mark.image) {
    return `<span class="search-hit-mark"><img src="${escapeAttr(mark.image)}" alt="${escapeAttr(title)}" title="${escapeAttr(title)}" /></span>`;
  }
  const color = mark.color ? ` style="color:${escapeAttr(mark.color)}"` : '';
  return `<span class="search-hit-mark"${color} title="${escapeAttr(title)}">${escapeHtml(markGlyph(mark))}</span>`;
}
