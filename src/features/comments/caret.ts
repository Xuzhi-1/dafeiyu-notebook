/** 把点击坐标换算成注释纯文本中的字符偏移。 */

export function caretOffsetAt(line: HTMLElement, clientX: number, clientY: number): number | null {
  const text = line.querySelector<HTMLElement>('.comment-line-text');
  if (!text) return null;
  const doc = document as Document & {
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
  };
  let node: Node | null = null;
  let offset = 0;
  if (doc.caretPositionFromPoint) {
    const position = doc.caretPositionFromPoint(clientX, clientY);
    if (position) {
      node = position.offsetNode;
      offset = position.offset;
    }
  } else if (doc.caretRangeFromPoint) {
    const range = doc.caretRangeFromPoint(clientX, clientY);
    if (range) {
      node = range.startContainer;
      offset = range.startOffset;
    }
  }
  if (!node || !text.contains(node)) return null;
  try {
    const range = document.createRange();
    range.selectNodeContents(text);
    range.setEnd(node, offset);
    return range.toString().length;
  } catch {
    return null;
  }
}

/** 当前选区在该条注释内的纯文本起止偏移；选区不在同一条注释内时返回 null。 */
export function selectionInLine(line: HTMLElement): { start: number; end: number } | null {
  const text = line.querySelector<HTMLElement>('.comment-line-text');
  const selection = window.getSelection();
  if (!text || !selection || !selection.rangeCount || selection.isCollapsed) return null;
  const range = selection.getRangeAt(0);
  if (!text.contains(range.startContainer) || !text.contains(range.endContainer)) return null;
  try {
    const startRange = document.createRange();
    startRange.selectNodeContents(text);
    startRange.setEnd(range.startContainer, range.startOffset);
    const endRange = document.createRange();
    endRange.selectNodeContents(text);
    endRange.setEnd(range.endContainer, range.endOffset);
    return { start: startRange.toString().length, end: endRange.toString().length };
  } catch {
    return null;
  }
}
