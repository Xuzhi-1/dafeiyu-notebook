/** 工具栏浮层打开时，阻止 Delete/Backspace/Enter 继续落到正文或表格单元格。 */

const OPEN_PANEL_SELECTOR = [
  '.table-picker:not([hidden])',
  '.size-popover',
  '#mark-panel:not([hidden])',
  '#comment-panel:not([hidden])',
  '.style-panel:not([hidden])',
  '#link-panel:not([hidden])',
  '#color-picker:not([hidden])',
  '#search:not([hidden])',
].join(', ');

export function installPanelKeyboardGuard(): void {
  document.addEventListener('keydown', (event) => {
    if (event.defaultPrevented) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (!target.closest('.block-content, .doc-table')) return;
    if (!document.querySelector(OPEN_PANEL_SELECTOR)) return;
    const edits = event.key.length === 1 || event.key === 'Delete' || event.key === 'Backspace' || event.key === 'Enter';
    if (!edits) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }, true);
}
