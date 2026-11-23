/** 编辑区滚动策略：新建/合并区块时恢复原 scrollTop，不自动滚动。 */

export function preserveDocumentScroll(workspace: HTMLElement | null, action: () => void, scrollTop?: number): void {
  if (!workspace) {
    action();
    return;
  }
  const top = scrollTop ?? workspace.scrollTop;
  action();
  workspace.scrollTop = top;
  setTimeout(() => {
    workspace.scrollTop = top;
  }, 0);
}

export interface ScrollAnchor {
  readonly blockId: string;
  readonly offset: number;
}

/** 记录一个块相对工作区顶部的偏移，粘贴后按该块恢复视觉位置。 */
export function captureScrollAnchor(workspace: HTMLElement | null, blockId: string | null): ScrollAnchor | null {
  if (!workspace || !blockId) return null;
  const el = workspace.querySelector<HTMLElement>(`.block[data-id="${CSS.escape(blockId)}"]`);
  if (!el) return null;
  return {
    blockId,
    offset: el.getBoundingClientRect().top - workspace.getBoundingClientRect().top,
  };
}

/** 恢复锚点的视觉位置；不改写调用方的业务逻辑，也不监听用户滚动。 */
export function restoreScrollAnchor(workspace: HTMLElement | null, anchor: ScrollAnchor | null): void {
  if (!workspace || !anchor) return;
  const apply = (): void => {
    const el = workspace.querySelector<HTMLElement>(`.block[data-id="${CSS.escape(anchor.blockId)}"]`);
    if (!el) return;
    const offset = el.getBoundingClientRect().top - workspace.getBoundingClientRect().top;
    const max = Math.max(0, workspace.scrollHeight - workspace.clientHeight);
    const next = Math.min(max, Math.max(0, workspace.scrollTop + offset - anchor.offset));
    if (next !== workspace.scrollTop) workspace.scrollTop = next;
  };
  apply();
  window.requestAnimationFrame(apply);
}

export function holdDocumentScroll(workspace: HTMLElement | null, duration = 500): void {
  if (!workspace) return;
  const top = workspace.scrollTop;
  let active = true;
  const restore = (): void => {
    if (!active) return;
    if (workspace.scrollTop !== top) workspace.scrollTop = top;
  };
  const onScroll = (event: Event): void => {
    if (event.target === workspace) restore();
  };
  workspace.addEventListener('scroll', onScroll, true);
  window.requestAnimationFrame(restore);
  window.setTimeout(() => {
    active = false;
    workspace.removeEventListener('scroll', onScroll, true);
  }, duration);
}

export function stabilizeDocumentScroll(workspace: HTMLElement | null, scrollTop: number): void {
  if (!workspace) return;
  const restore = (): void => {
    if (workspace.scrollTop !== scrollTop) workspace.scrollTop = scrollTop;
  };
  restore();
  window.setTimeout(restore, 0);
  window.requestAnimationFrame(() => {
    restore();
    window.requestAnimationFrame(restore);
  });
}

export function revealBlockOnInput(workspace: HTMLElement | null, block: HTMLElement): void {
  if (!workspace || !workspace.contains(block)) return;
  const area = workspace.getBoundingClientRect();
  const rect = block.getBoundingClientRect();
  const margin = 12;
  if (area.height <= margin * 2 || rect.height > area.height - margin * 2) return;
  let delta = 0;
  if (rect.top < area.top + margin) delta = rect.top - area.top - margin;
  else if (rect.bottom > area.bottom - margin) delta = rect.bottom - area.bottom + margin;
  if (!delta) return;
  const maxScroll = Math.max(0, workspace.scrollHeight - workspace.clientHeight);
  workspace.scrollTop = Math.max(0, Math.min(maxScroll, workspace.scrollTop + delta));
}

export interface FocusContentOptions {
  atEnd: boolean;
  offset?: number;
  scrollTop: number;
}

/** 统计正文中的可导航字符数；<br> 占一个位置，和光标移动保持一致。 */
export function contentTextLength(content: HTMLElement): number {
  let length = 0;
  const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  let node = walker.nextNode();
  while (node) {
    if (node.nodeType === Node.TEXT_NODE) length += (node as Text).data.length;
    else if ((node as Element).tagName === 'BR') length += 1;
    node = walker.nextNode();
  }
  return length;
}

function caretAtOffset(content: HTMLElement, offset: number): Range {
  const range = document.createRange();
  let remaining = Math.max(0, offset);
  const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  let node = walker.nextNode();
  while (node) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node as Text;
      if (remaining <= text.data.length) {
        range.setStart(text, remaining);
        return range;
      }
      remaining -= text.data.length;
    } else if ((node as Element).tagName === 'BR') {
      if (remaining === 0) {
        range.setStartBefore(node);
        return range;
      }
      remaining -= 1;
      if (remaining === 0) {
        range.setStartAfter(node);
        return range;
      }
    }
    node = walker.nextNode();
  }
  range.selectNodeContents(content);
  range.collapse(false);
  return range;
}

export function focusContentWithoutScroll(content: HTMLElement, options: FocusContentOptions): void {
  const workspace = content.closest<HTMLElement>('.workspace');
  const scrollTop = options.scrollTop;

  content.focus({ preventScroll: true });
  const range = document.createRange();
  if (options.atEnd) {
    range.selectNodeContents(content);
    range.collapse(false);
  } else {
    const caret = caretAtOffset(content, options.offset ?? 0);
    range.setStart(caret.startContainer, caret.startOffset);
    range.collapse(true);
  }
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);

  if (!workspace) return;
  workspace.scrollTop = scrollTop;
  setTimeout(() => {
    workspace.scrollTop = scrollTop;
  }, 0);
}
