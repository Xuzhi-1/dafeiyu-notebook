/** 注释行的小型 DOM 构造器，避免编辑器主类堆满 createElement。 */

import { t } from '../../i18n/index.js';

export function createDraftLine(host: HTMLElement, color: string, isGroup: boolean): HTMLElement {
  const line = document.createElement('div');
  line.className = `comment-line comment-draft${isGroup ? ' comment-line-group' : ''}`;
  line.style.setProperty('--comment-color', color);
  const handle = document.createElement('span');
  handle.className = 'comment-drag';
  handle.textContent = '⠿';
  const body = document.createElement('div');
  body.className = 'comment-line-text';
  line.append(handle, body);
  const tail = host.querySelector<HTMLElement>('[data-comment-drop-tail]');
  if (tail) host.insertBefore(line, tail);
  else host.appendChild(line);
  return line;
}

export function ensureLineText(line: HTMLElement): HTMLElement {
  const existing = line.querySelector<HTMLElement>(':scope > .comment-line-text');
  if (existing) return existing;
  const text = document.createElement('div');
  text.className = 'comment-line-text';
  line.insertBefore(text, line.querySelector('.comment-line-image'));
  return text;
}

export function createActionBar(): HTMLElement {
  const actions = document.createElement('div');
  actions.className = 'notes-actions comment-inline-actions';
  actions.dataset.commentUi = '1';
  const image = document.createElement('button');
  image.type = 'button';
  image.dataset.noteImage = '1';
  image.textContent = t('插入内容');
  const spacer = document.createElement('span');
  spacer.className = 'notes-spacer';
  const remove = document.createElement('button');
  remove.type = 'button';
  remove.dataset.noteDelete = '1';
  remove.textContent = t('删除注释');
  const close = document.createElement('button');
  close.type = 'button';
  close.dataset.noteClose = '1';
  close.textContent = t('关闭');
  const confirm = document.createElement('button');
  confirm.type = 'button';
  confirm.dataset.noteAdd = '1';
  confirm.textContent = t('确定');
  actions.append(image, spacer, remove, close, confirm);
  return actions;
}
