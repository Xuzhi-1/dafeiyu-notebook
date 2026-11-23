/** 注释交互的文档级监听：复制清洗与空白点击提交。 */

import type { Store } from '../../core/store.js';
import { COMMENT_CLICK_BUFFER, lastBlockExtensionBounds } from './geometry.js';
import type { InlineCommentEditor } from './inlineEditor.js';
import { sanitizeCommentHtml, trimCommentBoundary } from './sanitizeComment.js';

export function attachCommentCopy(): void {
  document.addEventListener('copy', (event) => {
    const selection = window.getSelection();
    if (!selection || !selection.rangeCount || selection.isCollapsed) return;
    const range = selection.getRangeAt(0);
    const lines = [...document.querySelectorAll<HTMLElement>('.comment-line-text')]
      .filter((text) => range.intersectsNode(text));
    if (!lines.length) return;
    const clipboard = event.clipboardData;
    if (!clipboard) return;
    const html: string[] = [];
    const plain: string[] = [];
    for (const text of lines) {
      const part = document.createRange();
      part.selectNodeContents(text);
      if (text.contains(range.startContainer)) part.setStart(range.startContainer, range.startOffset);
      if (text.contains(range.endContainer)) part.setEnd(range.endContainer, range.endOffset);
      const holder = document.createElement('div');
      holder.append(part.cloneContents());
      const clean = trimCommentBoundary(sanitizeCommentHtml(holder.innerHTML));
      if (clean) html.push(clean);
      if (part.toString()) plain.push(part.toString());
    }
    if (!html.length) return;
    clipboard.setData('text/html', html.join('<br>'));
    clipboard.setData('text/plain', plain.join('\n'));
    event.preventDefault();
  });
}

export interface BlankClickOptions {
  store: Store;
  blocksHost: HTMLElement;
  inline: InlineCommentEditor;
}

export function attachCommentBlankClick({ store, blocksHost, inline }: BlankClickOptions): {
  consumeBlankClick(): boolean;
} {
  let suppressBlankClick = false;

  document.addEventListener('pointerdown', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (target.closest('[data-comment-ui], .comment-line, .comment-inline-actions, #btn-comment, #btn-comment-more, #comment-panel, #color-picker')) return;
    const lastBlock = store.doc.blocks[store.doc.blocks.length - 1];
    const lastEl = lastBlock ? blocksHost.querySelector<HTMLElement>(`.block[data-id="${lastBlock.id}"]`) : null;
    const extension = lastBlock ? lastBlockExtensionBounds(blocksHost, lastBlock.id) : null;
    if (lastEl && extension && event.clientY > lastEl.getBoundingClientRect().bottom - 1
      && event.clientY < extension.bottom + COMMENT_CLICK_BUFFER) return;
    if (target.closest('#btn-highlight, #btn-highlight-more, #highlight-color-panel, #btn-text-color, #btn-text-color-more, #text-color-panel, #color-picker')) return;
    if (inline.isEditing) {
      suppressBlankClick = blocksHost.contains(target);
      inline.save();
    } else {
      suppressBlankClick = false;
    }
  }, true);

  return {
    consumeBlankClick(): boolean {
      const value = suppressBlankClick;
      suppressBlankClick = false;
      return value;
    },
  };
}
