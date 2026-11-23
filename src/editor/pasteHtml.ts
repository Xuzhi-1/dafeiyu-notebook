/** 粘贴 HTML 片段：按图片位置切成有序的文字段/图片段。 */

import { sanitizeInline } from './sanitize.js';

export type PasteSegment =
  | { kind: 'text'; html: string }
  | { kind: 'image'; src: string; alt: string };

export function splitPastedHtml(html: string): PasteSegment[] {
  const template = document.createElement('template');
  template.innerHTML = html;
  const images = [...template.content.querySelectorAll('*')].filter((element) => {
    const name = element.localName;
    return name === 'img' || (name === 'imagedata' && element.hasAttribute('src'));
  });
  if (!images.length) {
    const clean = sanitizeInline(html);
    return textOf(clean) ? [{ kind: 'text', html: clean }] : [];
  }

  const segments: PasteSegment[] = [];
  let previous: Element | null = null;
  for (const image of images) {
    const range = document.createRange();
    if (previous) range.setStartAfter(previous);
    else range.setStart(template.content, 0);
    range.setEndBefore(image);
    const holder = document.createElement('div');
    holder.appendChild(range.cloneContents());
    const clean = trimEdgeBreaks(sanitizeInline(holder.innerHTML));
    if (textOf(clean)) segments.push({ kind: 'text', html: clean });
    segments.push({
      kind: 'image',
      src: image.getAttribute('src') ?? '',
      alt: image.getAttribute('alt') ?? '',
    });
    previous = image;
  }

  const tail = document.createRange();
  tail.setStartAfter(previous!);
  tail.setEnd(template.content, template.content.childNodes.length);
  const holder = document.createElement('div');
  holder.appendChild(tail.cloneContents());
  const clean = trimEdgeBreaks(sanitizeInline(holder.innerHTML));
  if (textOf(clean)) segments.push({ kind: 'text', html: clean });
  return segments;
}

function trimEdgeBreaks(html: string): string {
  const holder = document.createElement('div');
  holder.innerHTML = html;
  while (holder.firstChild?.nodeName === 'BR') holder.firstChild.remove();
  while (holder.lastChild?.nodeName === 'BR') holder.lastChild.remove();
  return holder.innerHTML;
}

function textOf(html: string): boolean {
  const holder = document.createElement('div');
  holder.innerHTML = html;
  return Boolean(holder.textContent?.trim());
}
