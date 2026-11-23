/** 标题栏搜索：只负责打开/关闭结果面板，查询由 SearchPanel 处理。 */

import type { SearchPanel } from '../ui/search.js';

export function installTitlebarSearch(
  panel: SearchPanel | null,
  input: HTMLInputElement | null,
): void {
  if (!panel || !input) return;

  input.addEventListener('focus', () => panel.openWith(input.value));
  input.addEventListener('pointerdown', () => panel.openWith(input.value));
  input.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    panel.close();
  });

  document.addEventListener('pointerdown', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (target.closest('#titlebar-search, #search')) return;
    panel.close();
    if (input.value) panel.clear();
  }, true);
}
