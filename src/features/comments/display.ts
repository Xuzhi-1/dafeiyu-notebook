/**
 * 注释显示：只读注释行。组范围线由 overlay 负责。
 */

import type { CommentAnnotation } from '../../core/types.js';
import { commentToHtml } from './sanitizeComment.js';
import { t } from '../../i18n/index.js';

const renderedNotes = new WeakMap<HTMLElement, readonly CommentAnnotation[]>();

function sameNotes(a: readonly CommentAnnotation[], b: readonly CommentAnnotation[]): boolean {
  return a.length === b.length && a.every((note, index) => note === b[index]);
}

export function renderCommentLines(host: HTMLElement, notes: readonly CommentAnnotation[]): void {
  const previous = renderedNotes.get(host);
  if (previous && sameNotes(previous, notes) && host.querySelector('[data-comment-drop-tail]')) return;
  renderedNotes.set(host, notes);
  host.innerHTML = '';
  const blockNotes: CommentAnnotation[] = [];
  const groupNotes: CommentAnnotation[] = [];
  for (const note of notes) {
    if (note.anchor.blockIds?.length) groupNotes.push(note);
    else blockNotes.push(note);
  }
  // 按真实数组顺序渲染：旧注释在上，新注释追加在下方。
  const ordered = [...blockNotes, ...groupNotes];
  for (const note of ordered) {
    const line = document.createElement('div');
    line.className = 'comment-line';
    line.dataset.commentId = note.id;
    const isGroup = Boolean(note.anchor.blockIds?.length);
    if (isGroup) line.classList.add('comment-line-group');
    line.style.setProperty('--comment-color', note.color || (isGroup ? '#8aa4ff' : '#4d6bfe'));

    const drag = document.createElement('span');
    drag.className = 'comment-drag gutter-handle';
    drag.draggable = true;
    drag.textContent = '⠿';
    line.appendChild(drag);

    if (note.html) {
      const text = document.createElement('div');
      text.className = 'comment-line-text';
      text.innerHTML = commentToHtml(note.html, note.format === 'html');
      line.appendChild(text);
    }
    (note.images ?? []).forEach((src, index) => {
      const wrap = document.createElement('div');
      wrap.className = 'comment-line-image-wrap';
      wrap.dataset.imageAlign = note.imageAligns?.[index] ?? 'left';
      wrap.style.width = `${Math.min(100, Math.max(10, note.imageWidths?.[index] ?? 100))}%`;
      const img = document.createElement('img');
      img.className = 'comment-line-image';
      img.src = src;
      img.alt = t('注释图片');
      const handle = document.createElement('span');
      handle.className = 'comment-image-resize';
      handle.dataset.commentImageResize = String(index);
      handle.title = t('拖动调整图片宽度');
      wrap.append(img, handle);
      line.appendChild(wrap);
    });
    host.appendChild(line);
  }
  const tail = document.createElement('div');
  tail.className = 'comment-drop-tail';
  tail.dataset.commentDropTail = '1';
  host.appendChild(tail);
}
