/** 工具栏浮层打开后把键盘焦点移出正文，避免 Delete/Enter 继续落到区块。 */

export function focusToolbarPanel(panel: HTMLElement | null): void {
  if (!panel) return;
  if (panel.tabIndex < 0) panel.tabIndex = -1;
  panel.focus({ preventScroll: true });
}
