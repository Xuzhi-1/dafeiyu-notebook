/** 注释编辑器粘贴：优先插入清洗后的富文本。 */

import { sanitizeCommentHtml, trimCommentBoundary } from './sanitizeComment.js';

export function attachCommentPaste(text: HTMLElement): () => void {
  const onPaste = (event: ClipboardEvent): void => {
    const data = event.clipboardData;
    if (!data) return;
    const rich = data.getData('text/html');
    const plain = data.getData('text/plain');
    event.preventDefault();
    const clean = rich ? trimCommentBoundary(sanitizeCommentHtml(rich)) : '';
    if (clean.trim()) document.execCommand('insertHTML', false, clean);
    else if (plain.trim()) document.execCommand('insertText', false, plain.replace(/^\n+|\n+$/g, ''));
  };
  text.addEventListener('paste', onPaste);
  return () => text.removeEventListener('paste', onPaste);
}
