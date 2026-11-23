/**
 * 目录跳转：无动画、目标落在视口偏上 22%，文末自动贴底（行为规格 R9）。
 * 落点用一次性高亮提示（R8：组目录只闪一下，不常驻框选）。
 */

import type { TocEntry } from '../core/types.js';

export function jumpToEntry(entry: TocEntry, workspace: HTMLElement): boolean {
  return jumpToBlock(entry.blockId, workspace);
}

export function jumpToBlock(blockId: string, workspace: HTMLElement): boolean {
  const el = document.querySelector<HTMLElement>(`.block[data-id="${blockId}"]`);
  if (!el) return false;
  const wsRect = workspace.getBoundingClientRect();
  const rect = el.getBoundingClientRect();
  const topOffset = Math.round(wsRect.height * 0.22);
  const maxScroll = Math.max(0, workspace.scrollHeight - workspace.clientHeight);
  workspace.scrollTop = Math.max(0, Math.min(maxScroll, workspace.scrollTop + (rect.top - wsRect.top) - topOffset));
  return true;
}
