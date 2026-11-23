/** 最后一个区块及其块扩展（注释等）的点击几何，正文与注释共用。 */

export const COMMENT_CLICK_BUFFER = 12;

export interface ExtensionBounds {
  top: number;
  bottom: number;
}

export function lastBlockExtensionBounds(host: HTMLElement, blockId: string): ExtensionBounds | null {
  const block = host.querySelector<HTMLElement>(`.block[data-id="${blockId}"]`);
  if (!block) return null;
  const blockRect = block.getBoundingClientRect();
  const rects = [...host.querySelectorAll<HTMLElement>('[data-block-extension]')]
    .filter((element) => element.dataset.blockExtension === blockId)
    .map((element) => element.getBoundingClientRect());
  if (!rects.length) return null;
  return {
    top: Math.min(blockRect.bottom, ...rects.map((rect) => rect.top)),
    bottom: Math.max(blockRect.bottom, ...rects.map((rect) => rect.bottom)),
  };
}
