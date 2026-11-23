/** 文本选区快照：用块 ID 和纯文本偏移保存，不持有易失效的 DOM Range。 */

/** 清空浏览器文本选区，并让正文编辑失焦。 */
export function clearDocumentTextSelection(): void {
  window.getSelection()?.removeAllRanges();
  const active = document.activeElement;
  if (active instanceof HTMLElement && active.closest('.block-content, .doc-table')) active.blur();
}

export interface TextSelectionSnapshot {
  readonly startBlockId: string;
  readonly startOffset: number;
  readonly endBlockId: string;
  readonly endOffset: number;
}

interface TextPoint {
  readonly node: Text;
  readonly offset: number;
}

function blockOf(node: Node): HTMLElement | null {
  const element = (node instanceof Element ? node : node.parentElement)?.closest<HTMLElement>('.block-content');
  return element ?? null;
}

function textOffset(block: HTMLElement, node: Node, offset: number): number {
  const range = document.createRange();
  range.selectNodeContents(block);
  range.setEnd(node, offset);
  return range.toString().length;
}

function pointAt(block: HTMLElement, offset: number): TextPoint | null {
  const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
  let remaining = Math.max(0, offset);
  let node = walker.nextNode() as Text | null;
  while (node) {
    const length = node.data.length;
    if (remaining <= length) return { node, offset: remaining };
    remaining -= length;
    node = walker.nextNode() as Text | null;
  }
  const last = block.lastChild;
  return last instanceof Text ? { node: last, offset: last.data.length } : null;
}

export function captureTextSelection(): TextSelectionSnapshot | null {
  const selection = window.getSelection();
  if (!selection || !selection.rangeCount || selection.isCollapsed) return null;
  const range = selection.getRangeAt(0);
  const startBlock = blockOf(range.startContainer);
  const endBlock = blockOf(range.endContainer);
  if (!startBlock || !endBlock || !startBlock.isConnected || !endBlock.isConnected) return null;
  const startId = startBlock.closest<HTMLElement>('.block')?.dataset.id;
  const endId = endBlock.closest<HTMLElement>('.block')?.dataset.id;
  if (!startId || !endId) return null;
  return {
    startBlockId: startId,
    startOffset: textOffset(startBlock, range.startContainer, range.startOffset),
    endBlockId: endId,
    endOffset: textOffset(endBlock, range.endContainer, range.endOffset),
  };
}

export function restoreTextSelection(snapshot: TextSelectionSnapshot | null): Range | null {
  if (!snapshot) return null;
  const startBlock = document.querySelector<HTMLElement>(
    `.block[data-id="${snapshot.startBlockId}"] .block-content`,
  );
  const endBlock = document.querySelector<HTMLElement>(
    `.block[data-id="${snapshot.endBlockId}"] .block-content`,
  );
  if (!startBlock || !endBlock || !startBlock.isConnected || !endBlock.isConnected) return null;
  const start = pointAt(startBlock, snapshot.startOffset);
  const end = pointAt(endBlock, snapshot.endOffset);
  if (!start || !end) return null;
  try {
    const range = document.createRange();
    range.setStart(start.node, start.offset);
    range.setEnd(end.node, end.offset);
    return range.collapsed ? null : range;
  } catch {
    return null;
  }
}

/** 改用文本偏移恢复选区；返回的 Range 由调用方负责挂回 selection。 */
export function applyTextSelection(snapshot: TextSelectionSnapshot | null): boolean {
  const range = restoreTextSelection(snapshot);
  const selection = window.getSelection();
  if (!range || !selection) return false;
  selection.removeAllRanges();
  selection.addRange(range);
  return true;
}
