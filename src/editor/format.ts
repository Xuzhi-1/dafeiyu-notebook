/**
 * 行内格式与块级格式。
 *
 * 原则：格式命令直接作用于浏览器选区（这是唯一能正确处理中文选区的地方），
 * 执行完立刻把受影响块的 DOM 同步回模型 —— 模型仍然是事实来源。
 */

import type { Store } from '../core/store.js';
import { tableSetCellAlignOp, tableSetCellOp } from '../core/table.js';
import type { Op } from '../core/ops.js';
import { sanitizeInline } from './sanitize.js';
import { cssFontFamily } from '../core/font.js';

function hostOf(): HTMLElement {
  const host = document.querySelector<HTMLElement>('#blocks');
  if (!host) throw new Error('缺少 #blocks 容器');
  return host;
}

/** 把指定块的内容同步进模型。 */
function cellOfNode(node: Node | null): HTMLElement | null {
  const element = node instanceof Element ? node : node?.parentElement;
  return element?.closest<HTMLElement>('td[data-row], th[data-row]') ?? null;
}

function syncTableCells(store: Store, range: Range): void {
  const host = hostOf();
  const cells = [...host.querySelectorAll<HTMLElement>('.doc-table td[data-row], .doc-table th[data-row]')]
    .filter((cell) => range.intersectsNode(cell));
  if (!cells.length) return;
  store.dispatch((doc) => {
    const ops: Op[] = [];
    for (const cell of cells) {
      const blockId = cell.closest<HTMLElement>('.block')?.dataset.id;
      if (!blockId) continue;
      const block = doc.blocks.find((item) => item.id === blockId);
      if (!block || block.type !== 'table' || !block.meta?.richText) continue;
      const row = Number(cell.dataset.row);
      const column = Number(cell.dataset.column);
      if (!Number.isFinite(row) || !Number.isFinite(column)) continue;
      const html = sanitizeInline(cell.innerHTML);
      const next = tableSetCellOp(doc, blockId, row, column, html);
      if (next) ops.push(...next);
    }
    return ops.length ? ops : null;
  });
}

function syncBlocks(store: Store, ids: Iterable<string>): void {
  const host = hostOf();
  const ops = [] as { t: 'patchBlock'; id: string; patch: { html: string } }[];
  for (const id of ids) {
    const el = host.querySelector<HTMLElement>(`.block[data-id="${id}"] .block-content`);
    const block = store.doc.blocks.find((item) => item.id === id);
    if (!el || !block || block.html === el.innerHTML) continue;
    ops.push({ t: 'patchBlock', id, patch: { html: el.innerHTML } });
  }
  if (ops.length) store.dispatch(() => ops);
}

/** 把选区涉及的块（可能跨块）同步进模型 */
export function syncSelectionBlocks(store: Store): void {
  const host = hostOf();
  const selection = window.getSelection();
  if (!selection || !selection.rangeCount) return;
  const range = selection.getRangeAt(0);
  const touched = new Set<string>();
  for (const el of host.querySelectorAll<HTMLElement>('.block')) {
    if (!range.intersectsNode(el)) continue;
    const id = el.dataset.id;
    if (id) touched.add(id);
  }
  if (!touched.size) {
    const el = (range.startContainer instanceof Element ? range.startContainer : range.startContainer.parentElement)?.closest<HTMLElement>('.block');
    if (el?.dataset.id) touched.add(el.dataset.id);
  }
  if (!touched.size) return;
  syncTableCells(store, range);
  syncBlocks(store, touched);
}

export type FormatTarget =
  | { kind: 'block'; id: string; content: HTMLElement }
  | { kind: 'table-cell'; blockId: string; row: number; column: number; content: HTMLElement }
  | { kind: 'comment'; noteId: string; blockId: string; content: HTMLElement };

function selectedIds(store: Store): readonly string[] {
  return store.selection.blockIds.length
    ? store.selection.blockIds
    : [store.selection.activeId].filter((id): id is string => Boolean(id));
}

/** 多选格式目标：正文块、表格单元格、选中块下的注释。 */
export function collectFormatTargets(store: Store): FormatTarget[] {
  const host = hostOf();
  const targets: FormatTarget[] = [];
  const seenComments = new Set<string>();
  for (const id of selectedIds(store)) {
    const blockEl = host.querySelector<HTMLElement>(`.block[data-id="${id}"]`);
    const block = store.doc.blocks.find((item) => item.id === id);
    if (!blockEl || !block) continue;
    if (block.type === 'table') {
      for (const cell of blockEl.querySelectorAll<HTMLElement>('.doc-table td[data-row][data-column], .doc-table th[data-row][data-column]')) {
        if (!cell.textContent?.trim()) continue;
        const row = Number(cell.dataset.row);
        const column = Number(cell.dataset.column);
        if (Number.isFinite(row) && Number.isFinite(column)) {
          targets.push({ kind: 'table-cell', blockId: id, row, column, content: cell });
        }
      }
    } else {
      const content = blockEl.querySelector<HTMLElement>('.block-content');
      if (content?.textContent?.trim()) targets.push({ kind: 'block', id, content });
    }
    for (const line of host.querySelectorAll<HTMLElement>(`.comment-display[data-block-extension="${id}"] .comment-line[data-comment-id]`)) {
      const noteId = line.dataset.commentId;
      const content = line.querySelector<HTMLElement>('.comment-line-text');
      if (!noteId || !content?.textContent?.trim() || seenComments.has(noteId)) continue;
      seenComments.add(noteId);
      targets.push({ kind: 'comment', noteId, blockId: id, content });
    }
  }
  return targets;
}

function toggleTagInContent(content: HTMLElement, command: 'bold' | 'italic' | 'underline' | 'strikeThrough'): void {
  const tags = command === 'bold'
    ? ['B', 'STRONG']
    : command === 'italic'
      ? ['I', 'EM']
      : command === 'underline' ? ['U'] : ['S', 'STRIKE'];
  const selector = tags.join(',');
  const textNodes: Text[] = [];
  const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    if (node.textContent?.trim()) textNodes.push(node as Text);
    node = walker.nextNode();
  }
  if (!textNodes.length) return;
  const allFormatted = textNodes.every((text) => {
    const tag = text.parentElement?.closest<HTMLElement>(selector);
    return Boolean(tag && content.contains(tag));
  });
  if (allFormatted) {
    for (const tag of [...content.querySelectorAll<HTMLElement>(selector)]) {
      tag.replaceWith(...tag.childNodes);
    }
    return;
  }
  const tagName = command === 'bold' ? 'b' : command === 'italic' ? 'i' : command === 'underline' ? 'u' : 's';
  const wrapper = document.createElement(tagName);
  wrapper.append(...content.childNodes);
  content.appendChild(wrapper);
}

export function toggleFormatTargets(targets: readonly FormatTarget[], command: 'bold' | 'italic' | 'underline' | 'strikeThrough'): void {
  for (const target of targets) toggleTagInContent(target.content, command);
}

/** 把格式目标写回模型：正文块、表格单元格、注释。 */
export function syncFormatTargets(store: Store, targets: readonly FormatTarget[]): boolean {
  if (!targets.length) return false;
  return store.dispatch((doc) => {
    const ops: Op[] = [];
    const comments = new Map<string, string>();
    const cells = new Map<string, Map<string, { row: number; column: number; html: string }>>();
    for (const target of targets) {
      const html = sanitizeInline(target.content.innerHTML);
      if (target.kind === 'block') {
        const block = doc.blocks.find((item) => item.id === target.id);
        if (block && block.html !== html) ops.push({ t: 'patchBlock', id: target.id, patch: { html } });
      } else if (target.kind === 'comment') {
        comments.set(target.noteId, html);
      } else {
        const key = `${target.row}:${target.column}`;
        const table = cells.get(target.blockId) ?? new Map();
        table.set(key, { row: target.row, column: target.column, html });
        cells.set(target.blockId, table);
      }
    }
    for (const [blockId, cellMap] of cells) {
      const block = doc.blocks.find((item) => item.id === blockId);
      if (!block || block.type !== 'table') continue;
      const rows = (block.meta?.rows ?? []).map((row) => [...row]);
      for (const { row, column, html } of cellMap.values()) {
        if (rows[row] && rows[row][column] !== undefined) rows[row][column] = html;
      }
      ops.push({
        t: 'patchBlock',
        id: blockId,
        patch: { meta: { ...(block.meta ?? {}), rows, richText: true } },
      });
    }
    if (comments.size) {
      const annotations = doc.annotations.map((annotation) => {
        if (annotation.type !== 'comment' || !comments.has(annotation.id)) return annotation;
        return { ...annotation, html: comments.get(annotation.id)!, format: 'html' as const };
      });
      ops.push({ t: 'patchDoc', patch: { annotations } });
    }
    return ops.length ? ops : null;
  });
}

export function toggleInline(store: Store, command: 'bold' | 'italic' | 'underline' | 'strikeThrough'): void {
  const selection = window.getSelection();
  if (!selection || !selection.rangeCount || selection.isCollapsed) {
    const targets = collectFormatTargets(store);
    toggleFormatTargets(targets, command);
    syncFormatTargets(store, targets);
    return;
  }
  document.execCommand(command);
  syncSelectionBlocks(store);
}

/** 用 span 包裹选区来实现颜色/高亮/字号等（execCommand 对这些不支持好） */
interface StyleEntry {
  readonly property: string;
  readonly value: string;
}

function styleEntries(style: Partial<CSSStyleDeclaration>): StyleEntry[] {
  const entries: StyleEntry[] = [];
  for (const [key, value] of Object.entries(style)) {
    if (typeof value !== 'string') continue;
    entries.push({
      property: key.replace(/[A-Z]/g, (char) => `-${char.toLowerCase()}`),
      value: key === 'fontFamily' ? cssFontFamily(value) : value,
    });
  }
  return entries;
}

function sameAttributes(a: HTMLElement, b: HTMLElement): boolean {
  const names = a.getAttributeNames();
  if (names.length !== b.getAttributeNames().length) return false;
  return names.every((name) => a.getAttribute(name) === b.getAttribute(name));
}

/** 去掉空 span，并合并相邻且属性完全相同的 span。 */
function cleanupSpans(root: HTMLElement): void {
  for (const span of [...root.querySelectorAll<HTMLElement>('span')]) {
    if (span.getAttributeNames().length) continue;
    span.replaceWith(...span.childNodes);
  }
  for (const span of [...root.querySelectorAll<HTMLElement>('span')]) {
    if (!span.isConnected) continue;
    let next = span.nextSibling;
    while (next?.nodeType === Node.TEXT_NODE && !next.textContent) next = next.nextSibling;
    if (!(next instanceof HTMLSpanElement) || !sameAttributes(span, next)) continue;
    span.append(...next.childNodes);
    next.remove();
  }
}

/** 移除块内局部字体覆盖，让块级字体真正生效。 */
export function clearInlineFontOverrides(content: HTMLElement, properties: readonly string[]): void {
  for (const element of [content, ...content.querySelectorAll<HTMLElement>('*')]) {
    for (const property of properties) element.style.removeProperty(property);
    if (!element.getAttribute('style')?.trim()) element.removeAttribute('style');
  }
  cleanupSpans(content);
}

function intersectBlock(block: HTMLElement, range: Range): Range | null {
  if (!range.intersectsNode(block)) return null;
  const inner = document.createRange();
  const startsInside = block.contains(range.startContainer);
  const endsInside = block.contains(range.endContainer);
  inner.setStart(
    startsInside ? range.startContainer : block,
    startsInside ? range.startOffset : 0,
  );
  inner.setEnd(
    endsInside ? range.endContainer : block,
    endsInside ? range.endOffset : block.childNodes.length,
  );
  return inner.collapsed ? null : inner;
}

function applyStyleToRange(range: Range, entries: readonly StyleEntry[]): HTMLSpanElement {
  const fragment = range.extractContents();
  for (const element of [...fragment.querySelectorAll<HTMLElement>('*')]) {
    for (const { property } of entries) element.style.removeProperty(property);
    if (!element.getAttribute('style')?.trim()) element.removeAttribute('style');
    if (element.tagName === 'SPAN' && !element.getAttributeNames().length) {
      element.replaceWith(...element.childNodes);
    }
  }
  const span = document.createElement('span');
  for (const { property, value } of entries) {
    if (value) span.style.setProperty(property, value);
  }
  span.append(fragment);
  range.insertNode(span);
  return span;
}

export function applyInlineStyleToRange(range: Range, style: Partial<CSSStyleDeclaration>): HTMLSpanElement | null {
  const entries = styleEntries(style);
  if (!entries.length) return null;
  return applyStyleToRange(range, entries);
}

export function applyInlineStyle(store: Store, style: Partial<CSSStyleDeclaration>, preserveSelection = false): void {
  const selection = window.getSelection();
  const entries = styleEntries(style);
  if (!entries.length) return;
  if (!selection || !selection.rangeCount || selection.isCollapsed) {
    const targets = collectFormatTargets(store);
    for (const target of targets) {
      const range = document.createRange();
      range.selectNodeContents(target.content);
      applyStyleToRange(range, entries);
      cleanupSpans(target.content);
    }
    syncFormatTargets(store, targets);
    return;
  }
  const range = selection.getRangeAt(0);

  const startCell = cellOfNode(range.startContainer);
  const endCell = cellOfNode(range.endContainer);
  if (startCell && startCell === endCell) {
    const block = startCell.closest<HTMLElement>('.block');
    const blockData = block ? store.doc.blocks.find((item) => item.id === block.dataset.id) : undefined;
    if (blockData?.type === 'table' && blockData.meta?.richText) {
      const span = applyStyleToRange(range, entries);
      cleanupSpans(startCell);
      if (preserveSelection) {
        const next = document.createRange();
        next.selectNodeContents(span);
        selection.removeAllRanges();
        selection.addRange(next);
      } else {
        selection.removeAllRanges();
      }
      syncTableCells(store, range);
      return;
    }
  }

  const targets: { block: HTMLElement; range: Range; id: string }[] = [];
  for (const block of hostOf().querySelectorAll<HTMLElement>('.block-content')) {
    const id = block.closest<HTMLElement>('.block')?.dataset.id;
    if (!id) continue;
    const inner = intersectBlock(block, range);
    if (inner) targets.push({ block, range: inner, id });
  }
  if (!targets.length) return;

  const applied: HTMLSpanElement[] = [];
  for (const target of targets) {
    applied.push(applyStyleToRange(target.range, entries));
    cleanupSpans(target.block);
  }
  if (preserveSelection && applied.length) {
    const first = applied[0];
    const last = applied[applied.length - 1];
    const next = document.createRange();
    next.setStart(first, 0);
    next.setEnd(last, last.childNodes.length);
    selection.removeAllRanges();
    selection.addRange(next);
  } else {
    selection.removeAllRanges();
  }
  syncBlocks(store, targets.map((target) => target.id));
}

export function setBlockAlign(store: Store, align: 'left' | 'center' | 'right' | 'justify'): void {
  const selection = window.getSelection();
  const active = document.activeElement;
  const ids = store.selection.blockIds.length ? store.selection.blockIds : [store.selection.activeId].filter(Boolean) as string[];
  if (!ids.length) return;
  const tableSelected = ids.some((id) => store.doc.blocks.find((item) => item.id === id)?.type === 'table');
  const cell = (tableSelected ? cellOfNode(selection?.anchorNode ?? null) : null)
    ?? (tableSelected && active instanceof Element ? active.closest<HTMLElement>('td[data-row], th[data-row]') : null);
  if (cell && ids.length === 1) {
    const block = cell.closest<HTMLElement>('.block');
    const blockData = block ? store.doc.blocks.find((item) => item.id === block.dataset.id) : undefined;
    const row = Number(cell.dataset.row);
    const column = Number(cell.dataset.column);
    if (blockData?.type === 'table' && blockData.meta?.richText && block?.dataset.id
      && Number.isFinite(row) && Number.isFinite(column)) {
      cell.style.textAlign = align;
      store.dispatch(() => tableSetCellAlignOp(store.doc, block.dataset.id!, row, column, align));
      return;
    }
  }
  const tableIds = ids.filter((id) => store.doc.blocks.find((block) => block.id === id)?.type === 'table');
  const host = hostOf();
  for (const id of tableIds) {
    for (const cellEl of host.querySelectorAll<HTMLElement>(`.block[data-id="${id}"] .doc-table td, .block[data-id="${id}"] .doc-table th`)) {
      cellEl.style.textAlign = align;
    }
  }
  store.dispatch((doc) => {
    const ops: Op[] = [];
    for (const id of ids) {
      const block = doc.blocks.find((item) => item.id === id);
      if (!block) continue;
      if (block.type === 'table') {
        const rows = block.meta?.rows ?? [];
        const cellAligns = rows.map((row) => row.map(() => align));
        ops.push({ t: 'patchBlock', id, patch: { meta: { ...(block.meta ?? {}), cellAligns } } });
      } else {
        ops.push({ t: 'patchBlock', id, patch: { align } });
      }
    }
    return ops.length ? ops : null;
  });
}

export function changeIndent(store: Store, delta: number): void {
  const ids = store.selection.blockIds.length ? store.selection.blockIds : [store.selection.activeId].filter(Boolean) as string[];
  if (!ids.length) return;
  store.dispatch((doc) => ids
    .filter((id) => doc.blocks.some((block) => block.id === id))
    .map((id) => {
      const block = doc.blocks.find((item) => item.id === id)!;
      const indent = Math.max(0, Math.min(8, (block.indent ?? 0) + delta));
      return { t: 'patchBlock', id, patch: { indent } };
    }));
}

export function setBlockType(store: Store, type: 'paragraph' | 'quote' | 'bullet' | 'number'): void {
  const ids = store.selection.blockIds.length ? store.selection.blockIds : [store.selection.activeId].filter(Boolean) as string[];
  if (!ids.length) return;
  store.dispatch((doc) => ids
    .filter((id) => doc.blocks.some((block) => block.id === id))
    .map((id) => ({ t: 'patchBlock', id, patch: { type } })));
}

export function groupSelection(store: Store): boolean {
  const ids = store.selection.blockIds;
  if (ids.length < 2) return false;
  const group = { id: `g_${Date.now().toString(36)}`, blockIds: [...ids] };
  return store.dispatch((doc) => [{ t: 'patchDoc', patch: { groups: [...doc.groups, group] } }]);
}

export function ungroupSelection(store: Store): boolean {
  const ids = new Set(store.selection.blockIds);
  if (!ids.size) return false;
  return store.dispatch((doc) => {
    const next = doc.groups.filter((group) => !group.blockIds.some((id) => ids.has(id)));
    if (next.length === doc.groups.length) return null;
    return [{ t: 'patchDoc', patch: { groups: next } }];
  });
}
