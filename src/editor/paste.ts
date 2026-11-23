/**
 * 粘贴处理：Ctrl+V 和右键最终共用 insertRichPaste / insertPlainPaste。
 * 右键只负责在异步读取剪贴板后恢复目标 Range。
 */

import { sanitizeInline } from './sanitize.js';
import { characterAfterCaret, characterBeforeCaret } from './textTarget.js';

function plainHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replace(/\r\n?/g, '\n')
    .replace(/\n/g, '<br>');
}

function plainSpan(text: string, format: Readonly<Record<string, string>> = {}): HTMLSpanElement {
  const span = document.createElement('span');
  for (const [property, value] of Object.entries(format)) {
    if (value) span.style.setProperty(property, value);
  }
  span.innerHTML = plainHtml(text);
  return span;
}

/** 取选区末尾字符（或块末尾/开头字符）的全部可见文字格式。 */
export function plainPasteFormat(range?: Range | null): Record<string, string> {
  const selection = window.getSelection();
  const source = range ?? (selection?.rangeCount ? selection.getRangeAt(0) : null);
  if (!source) return {};
  const end = source.cloneRange();
  end.collapse(false);
  const start = end.startContainer instanceof Element ? end.startContainer : end.startContainer.parentElement;
  const reference = characterBeforeCaret(end)
    ?? characterAfterCaret(end)
    ?? start?.closest<HTMLElement>('.block-content');
  if (!reference) return {};
  const style = getComputedStyle(reference);
  return {
    'font-family': style.fontFamily,
    'font-size': style.fontSize,
    'font-weight': style.fontWeight,
    'font-style': style.fontStyle,
    'text-decoration-line': style.textDecorationLine,
    'text-decoration-color': style.textDecorationColor,
    'color': style.color,
    'background-color': style.backgroundColor,
  };
}

export function insertPlainPaste(text: string, format: Readonly<Record<string, string>> = {}): boolean {
  if (!text) return false;
  const span = plainSpan(text, format);
  document.execCommand('insertHTML', false, span.getAttribute('style') ? span.outerHTML : span.innerHTML);
  return true;
}

export function insertRichPaste(html: string, text: string): boolean {
  const safe = html ? sanitizeInline(html).trim() : '';
  if (safe) {
    document.execCommand('insertHTML', false, safe);
    return true;
  }
  return insertPlainPaste(text);
}

export function attachPaste(host: HTMLElement): () => void {
  const onPaste = (event: ClipboardEvent): void => {
    if (event.defaultPrevented) return;
    const target = event.target;
    if (!(target instanceof HTMLElement) || !target.closest('.block-content')) return;
    const data = event.clipboardData;
    if (!data) return;
    event.preventDefault();
    if (!insertRichPaste(data.getData('text/html'), data.getData('text/plain'))) return;
    host.dispatchEvent(new CustomEvent('dfy:flush-editing'));
  };
  host.addEventListener('paste', onPaste);
  return () => host.removeEventListener('paste', onPaste);
}
