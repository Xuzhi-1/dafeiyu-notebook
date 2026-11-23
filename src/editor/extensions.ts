/**
 * 块外扩展的唯一摆放规则：
 * [data-block-extension="blockId"] 的节点按 order 贴在对应块后面。
 * 渲染器和评论模块都只调用这里，不各自算位置。
 */

export function placeBlockExtensions(host: HTMLElement): void {
  const blocks = new Map<string, HTMLElement>();
  const groups = new Map<string, HTMLElement[]>();
  for (const child of [...host.children]) {
    if (!(child instanceof HTMLElement)) continue;
    const blockId = child.dataset.id;
    if (blockId && child.classList.contains('block') && !blocks.has(blockId)) {
      blocks.set(blockId, child);
    }
    const extensionId = child.dataset.blockExtension;
    if (!extensionId) continue;
    const list = groups.get(extensionId) ?? [];
    list.push(child);
    groups.set(extensionId, list);
  }

  for (const [blockId, extensions] of groups) {
    const block = blocks.get(blockId);
    if (!block) continue;
    extensions.sort(
      (a, b) => Number(a.dataset.blockExtensionOrder ?? 0) - Number(b.dataset.blockExtensionOrder ?? 0),
    );
    let anchor: HTMLElement = block;
    for (const extension of extensions) {
      if (anchor.nextElementSibling !== extension) {
        anchor.insertAdjacentElement('afterend', extension);
      }
      anchor = extension;
    }
  }
}
