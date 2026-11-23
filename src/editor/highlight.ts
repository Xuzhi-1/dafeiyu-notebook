/** 高亮样式：马克笔 / 直线 / 波浪线 / 虚线。 */

import type { Store } from '../core/store.js';
import { collectFormatTargets, syncFormatTargets, syncSelectionBlocks } from './format.js';

export type HighlightMode = 'marker' | 'solid' | 'wavy' | 'dashed';

export interface HighlightStyle {
  mode: HighlightMode;
  color: string;
}

const HIGHLIGHT_ATTR = 'data-highlight';

function clearHighlightStyles(el: HTMLElement): void {
  for (const property of [
    'background-color',
    'box-decoration-break',
    '-webkit-box-decoration-break',
    'text-decoration-line',
    'text-decoration-style',
    'text-decoration-color',
    'text-decoration-thickness',
    'text-underline-offset',
  ]) {
    el.style.removeProperty(property);
  }
  if (!el.getAttribute('style')?.trim()) el.removeAttribute('style');
  el.removeAttribute(HIGHLIGHT_ATTR);
}

function isHighlightSpan(el: HTMLElement): boolean {
  if (el.dataset.highlight) return true;
  return el.tagName === 'SPAN'
    && Boolean(el.style.backgroundColor || el.style.textDecorationLine || el.style.textDecorationStyle);
}

function closestHighlight(node: Node | null): HTMLElement | null {
  const el = node instanceof Element ? node : node?.parentElement;
  const span = el?.closest<HTMLElement>('span');
  return span && isHighlightSpan(span) ? span : null;
}

function applyHighlightStyles(el: HTMLElement, style: HighlightStyle): void {
  clearHighlightStyles(el);
  el.dataset.highlight = style.mode;
  if (style.mode === 'marker') {
    el.style.backgroundColor = style.color;
    el.style.setProperty('-webkit-box-decoration-break', 'clone');
    el.style.setProperty('box-decoration-break', 'clone');
    return;
  }
  el.style.textDecorationLine = 'underline';
  el.style.textDecorationStyle = style.mode === 'solid'
    ? 'solid'
    : style.mode === 'wavy' ? 'wavy' : 'dashed';
  el.style.textDecorationColor = style.color;
  el.style.textDecorationThickness = '1.5px';
  el.style.textUnderlineOffset = '4px';
}

function normalizeFragment(fragment: DocumentFragment): void {
  for (const span of fragment.querySelectorAll<HTMLElement>('span')) {
    if (isHighlightSpan(span)) clearHighlightStyles(span);
  }
}

function unwrapHighlight(span: HTMLElement): void {
  clearHighlightStyles(span);
  if (!span.getAttributeNames().length) span.replaceWith(...span.childNodes);
}

function finishHighlightEditing(): void {
  const active = document.activeElement;
  if (active instanceof HTMLElement && active.closest('.block-content')) active.blur();
  window.getSelection()?.removeAllRanges();
}

function selectElement(el: HTMLElement): void {
  const selection = window.getSelection();
  if (!selection) return;
  selection.removeAllRanges();
  const range = document.createRange();
  range.selectNodeContents(el);
  selection.addRange(range);
}

export function applyHighlightToRange(range: Range, style: HighlightStyle): HTMLElement | null {
  const startHighlight = closestHighlight(range.startContainer);
  const endHighlight = closestHighlight(range.endContainer);
  if (startHighlight && startHighlight === endHighlight) {
    applyHighlightStyles(startHighlight, style);
    return startHighlight;
  }
  const fragment = range.extractContents();
  normalizeFragment(fragment);
  const span = document.createElement('span');
  applyHighlightStyles(span, style);
  span.appendChild(fragment);
  range.insertNode(span);
  return span;
}

export function removeHighlightInRange(range: Range): boolean {
  const anchor = range.commonAncestorContainer;
  const element = anchor instanceof Element ? anchor : anchor.parentElement;
  const scope = element?.closest<HTMLElement>('.block-content, .comment-line-text, .doc-table');
  if (!scope) return false;
  const spans = [...scope.querySelectorAll<HTMLElement>('span')]
    .filter((span) => isHighlightSpan(span) && range.intersectsNode(span));
  if (!spans.length) return false;
  for (const span of spans) unwrapHighlight(span);
  return true;
}

export function applyHighlight(store: Store, style: HighlightStyle): boolean {
  const selection = window.getSelection();
  if (!selection || !selection.rangeCount || selection.isCollapsed) return false;
  const range = selection.getRangeAt(0);
  const span = applyHighlightToRange(range, style);
  if (!span) return false;
  selectElement(span);
  syncSelectionBlocks(store);
  finishHighlightEditing();
  return true;
}

function applyToBlock(content: HTMLElement, style: HighlightStyle): void {
  for (const span of [...content.querySelectorAll<HTMLElement>('span')]) {
    if (!isHighlightSpan(span)) continue;
    unwrapHighlight(span);
  }
  const span = document.createElement('span');
  applyHighlightStyles(span, style);
  while (content.firstChild) span.appendChild(content.firstChild);
  content.appendChild(span);
}

export function applyHighlightToBlocks(store: Store, style: HighlightStyle): boolean {
  const targets = collectFormatTargets(store);
  if (!targets.length) return false;
  for (const target of targets) {
    if (!target.content.textContent?.trim()) continue;
    applyToBlock(target.content, style);
  }
  const changed = syncFormatTargets(store, targets);
  if (changed) finishHighlightEditing();
  return changed;
}

export function removeHighlight(store: Store): boolean {
  const host = document.querySelector<HTMLElement>('#blocks');
  const selection = window.getSelection();
  if (!host || !selection || !selection.rangeCount || selection.isCollapsed) return false;
  const range = selection.getRangeAt(0);
  const spans = [...host.querySelectorAll<HTMLElement>('span')]
    .filter((span) => isHighlightSpan(span) && range.intersectsNode(span));
  if (!spans.length) return false;
  const caret = range.cloneRange();
  caret.collapse(false);
  for (const span of spans) unwrapHighlight(span);
  selection.removeAllRanges();
  selection.addRange(caret);
  syncSelectionBlocks(store);
  finishHighlightEditing();
  return true;
}

export function removeHighlightFromBlocks(store: Store): boolean {
  const targets = collectFormatTargets(store);
  if (!targets.length) return false;
  let touched = false;
  for (const target of targets) {
    const spans = [...target.content.querySelectorAll<HTMLElement>('span')].filter(isHighlightSpan);
    if (!spans.length) continue;
    for (const span of spans) unwrapHighlight(span);
    touched = true;
  }
  if (!touched) return false;
  const changed = syncFormatTargets(store, targets);
  if (changed) finishHighlightEditing();
  return changed;
}
