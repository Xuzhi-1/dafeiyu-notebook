/** 块右侧的注释图标：灰色块注释、蓝色组注释。 */

import { t } from '../../i18n/index.js';

export interface CommentDecoration {
  readonly notes: number;
}

function ensureButton(
  el: HTMLElement,
  selector: string,
  className: string,
  dataset: Record<string, string>,
  title: string,
): HTMLButtonElement {
  let button = el.querySelector<HTMLButtonElement>(`:scope > ${selector}`);
  if (!button) {
    button = document.createElement('button');
    button.type = 'button';
    button.className = className;
    Object.assign(button.dataset, dataset);
    button.title = title;
    button.textContent = '💬';
    el.appendChild(button);
  }
  return button;
}

export function decorateComments(el: HTMLElement, decoration: CommentDecoration): void {
  const button = ensureButton(
    el,
    '.block-comment-btn',
    'block-comment-btn',
    { blockComment: '1', commentUi: '1' },
    t('注释'),
  );
  button.classList.toggle('has-notes', decoration.notes > 0);

  ensureButton(
    el,
    '.block-group-comment-btn',
    'block-group-comment-btn',
    { groupComment: '1', commentUi: '1' },
    t('组注释'),
  );
}
