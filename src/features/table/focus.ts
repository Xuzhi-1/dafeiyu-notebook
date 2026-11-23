/** 表格单元格指针聚焦：部分 Chromium 场景下单击可编辑 td 不会自动转移焦点。 */

export function attachTableFocus(host: HTMLElement): void {
  host.addEventListener('pointerdown', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const cell = target.closest<HTMLElement>('td[contenteditable="true"], th[contenteditable="true"]');
    if (!cell || !cell.closest('.block-table')) return;
    if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
    if (document.activeElement === cell) return;
    cell.focus({ preventScroll: true });
  }, true);
}
