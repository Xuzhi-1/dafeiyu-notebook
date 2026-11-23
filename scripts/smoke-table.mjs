/** 表格功能回归：尺寸选择、插入、首格聚焦、右键增删行列。 */

import { check, command, evaluate, finish, sleep } from './smoke/harness.mjs';

for (let i = 0; i < 30; i += 1) {
  if (await evaluate('Boolean(window.__dafeiyu?.ready)')) break;
  await sleep(200);
}

const tableFlow = JSON.parse(await evaluate(`(async () => {
  const handle = window.__dafeiyu;
  const store = handle.store;
  const first = store.doc.blocks[0];
  store.setSelection({ blockIds: [], activeId: null });
  document.querySelector('#btn-table').click();
  const noSelection = document.querySelector('.table-picker')?.hidden ?? true;
  store.setSelection({ blockIds: [first.id], activeId: first.id });
  document.querySelector('#btn-table').click();
  const picker = document.querySelector('.table-picker');
  const gridCount = picker.querySelectorAll('.table-picker-grid button').length;
  const customCount = picker.querySelectorAll('input').length;
  const lastCell = picker.querySelector('.table-picker-grid button:last-child');
  lastCell.dispatchEvent(new PointerEvent('pointerenter'));
  const hoverActive = picker.querySelectorAll('.table-picker-grid button.is-active').length;
  picker.querySelector('.table-picker-grid').dispatchEvent(new PointerEvent('pointerleave'));
  const leaveActive = picker.querySelectorAll('.table-picker-grid button.is-active').length;
  [...picker.querySelectorAll('.table-picker-grid button')]
    .find((button) => button.dataset.row === '3' && button.dataset.column === '4')
    ?.click();
  await new Promise((resolve) => setTimeout(resolve, 60));
  const tableId = store.selection.activeId;
  const table = store.doc.blocks.find((block) => block.id === tableId);
  const firstCell = document.querySelector('.block[data-id="' + tableId + '"] td');
  return JSON.stringify({
    noSelection,
    gridCount,
    customCount,
    hoverActive,
    leaveActive,
    type: table?.type,
    rows: table?.meta?.rows?.length,
    columns: table?.meta?.rows?.[0]?.length,
    firstCellFocused: document.activeElement === firstCell,
  });
})()`));
check('表格按钮无选区不响应，9×9 网格插入 3×4 并聚焦首格',
  tableFlow.noSelection === true
  && tableFlow.gridCount === 81
  && tableFlow.customCount === 2
  && tableFlow.hoverActive === 81
  && tableFlow.leaveActive === 0
  && tableFlow.type === 'table'
  && tableFlow.rows === 3
  && tableFlow.columns === 4
  && tableFlow.firstCellFocused === true,
  JSON.stringify(tableFlow));

const cellRects = JSON.parse(await evaluate(`(() => {
  const table = window.__dafeiyu.store.doc.blocks.find((block) => block.type === 'table');
  const cells = [...document.querySelectorAll('.block[data-id="' + table.id + '"] td')].slice(0, 2);
  return JSON.stringify(cells.map((cell) => {
    const rect = cell.getBoundingClientRect();
    return { x: rect.left + 8, y: rect.top + 8 };
  }));
})()`));
await command('Input.dispatchMouseEvent', { type: 'mouseMoved', x: cellRects[0].x, y: cellRects[0].y });
await command('Input.dispatchMouseEvent', { type: 'mousePressed', x: cellRects[0].x, y: cellRects[0].y, button: 'left', clickCount: 1 });
await command('Input.dispatchMouseEvent', { type: 'mouseReleased', x: cellRects[0].x, y: cellRects[0].y, button: 'left', clickCount: 1 });
await command('Input.insertText', { text: 'A' });
await sleep(80);
const secondRect = JSON.parse(await evaluate(`(() => {
  const table = window.__dafeiyu.store.doc.blocks.find((block) => block.type === 'table');
  const cell = document.querySelectorAll('.block[data-id="' + table.id + '"] td')[1];
  const rect = cell.getBoundingClientRect();
  return JSON.stringify({ x: rect.left + 8, y: rect.top + 8 });
})()`));
await command('Input.dispatchMouseEvent', { type: 'mouseMoved', x: secondRect.x, y: secondRect.y });
await command('Input.dispatchMouseEvent', { type: 'mousePressed', x: secondRect.x, y: secondRect.y, button: 'left', clickCount: 1 });
await command('Input.dispatchMouseEvent', { type: 'mouseReleased', x: secondRect.x, y: secondRect.y, button: 'left', clickCount: 1 });
await sleep(400);
const secondCellActive = await evaluate(`document.activeElement?.dataset?.column === '1'`);
check('表格编辑后单击其他格可直接聚焦', secondCellActive === true, String(secondCellActive));

const tableMenu = JSON.parse(await evaluate(`(async () => {
  const handle = window.__dafeiyu;
  const store = handle.store;
  const table = store.doc.blocks.find((block) => block.type === 'table');
  const cell = document.querySelector('.block[data-id="' + table.id + '"] td');
  const rect = cell.getBoundingClientRect();
  cell.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: rect.left + 4, clientY: rect.top + 4 }));
  const labels = [...document.querySelectorAll('.context-menu-item')].map((item) => item.textContent.trim());
  [...document.querySelectorAll('.context-menu-item')].find((item) => item.textContent.trim() === '在下方插入行')?.click();
  await new Promise((resolve) => setTimeout(resolve, 40));
  const afterRow = store.doc.blocks.find((block) => block.id === table.id)?.meta?.rows?.length;
  const next = document.querySelector('.block[data-id="' + table.id + '"] td');
  const nextRect = next.getBoundingClientRect();
  next.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: nextRect.left + 4, clientY: nextRect.top + 4 }));
  [...document.querySelectorAll('.context-menu-item')].find((item) => item.textContent.trim() === '删除当前列')?.click();
  await new Promise((resolve) => setTimeout(resolve, 40));
  const afterColumn = store.doc.blocks.find((block) => block.id === table.id)?.meta?.rows?.[0]?.length;
  return JSON.stringify({ labels, afterRow, afterColumn });
})()`));
check('表格右键可插入行、删除列',
  tableMenu.labels.includes('在上方插入行')
  && tableMenu.labels.includes('在左侧插入列')
  && tableMenu.labels.includes('删除当前列')
  && tableMenu.afterRow === 4
  && tableMenu.afterColumn === 3,
  JSON.stringify(tableMenu));

const tablePickerGuard = JSON.parse(await evaluate(`(() => {
  const handle = window.__dafeiyu;
  const table = handle.store.doc.blocks.find((block) => block.type === 'table');
  handle.store.setSelection({ blockIds: [table.id], activeId: table.id });
  document.querySelector('#btn-table').click();
  const panel = document.querySelector('.table-picker');
  const input = panel.querySelector('input');
  const focused = document.activeElement === panel;
  const blank = input.value === '' && input.placeholder === '';
  const inputs = panel.querySelectorAll('input');
  inputs[0].value = '10';
  inputs[1].value = '10';
  panel.querySelector('.table-picker-close').click();
  document.querySelector('#btn-table').click();
  const reset = [...panel.querySelectorAll('input')].every((item) => item.value === '');
  input.focus();
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true, cancelable: true }));
  return JSON.stringify({
    focused,
    blank,
    reset,
    tableAlive: handle.store.doc.blocks.some((block) => block.id === table.id),
    inputWidth: getComputedStyle(input).width,
  });
})()`));
check('表格自定义输入默认为空且删除不会误删表格', tablePickerGuard.focused === true && tablePickerGuard.blank === true && tablePickerGuard.reset === true && tablePickerGuard.tableAlive === true, JSON.stringify(tablePickerGuard));

await evaluate(`document.querySelector('.table-picker-close')?.click()`);
const resizeStart = JSON.parse(await evaluate(`(() => {
  const handle = window.__dafeiyu;
  const table = handle.store.doc.blocks.find((block) => block.type === 'table');
  const cell = document.querySelector('.block[data-id="' + table.id + '"] td');
  const rect = cell.getBoundingClientRect();
  return JSON.stringify({
    x: rect.right - 2,
    y: rect.top + 8,
    rowX: rect.left + 10,
    rowY: rect.bottom - 2,
  });
})()`));
await command('Input.dispatchMouseEvent', { type: 'mouseMoved', x: resizeStart.x, y: resizeStart.y });
await command('Input.dispatchMouseEvent', { type: 'mousePressed', x: resizeStart.x, y: resizeStart.y, button: 'left', clickCount: 1 });
await command('Input.dispatchMouseEvent', { type: 'mouseMoved', x: resizeStart.x + 50, y: resizeStart.y });
await command('Input.dispatchMouseEvent', { type: 'mouseReleased', x: resizeStart.x + 50, y: resizeStart.y, button: 'left', clickCount: 1 });
await sleep(80);
const afterColumnResize = JSON.parse(await evaluate(`(() => {
  const table = window.__dafeiyu.store.doc.blocks.find((block) => block.type === 'table');
  return JSON.stringify({ widths: table?.meta?.columnWidths ?? [] });
})()`));
const rowStart = JSON.parse(await evaluate(`(() => {
  const table = window.__dafeiyu.store.doc.blocks.find((block) => block.type === 'table');
  const rect = document.querySelector('.block[data-id="' + table.id + '"] td').getBoundingClientRect();
  return JSON.stringify({ x: rect.left + 10, y: rect.bottom - 2 });
})()`));
await command('Input.dispatchMouseEvent', { type: 'mouseMoved', x: rowStart.x, y: rowStart.y });
await command('Input.dispatchMouseEvent', { type: 'mousePressed', x: rowStart.x, y: rowStart.y, button: 'left', clickCount: 1 });
await command('Input.dispatchMouseEvent', { type: 'mouseMoved', x: rowStart.x, y: rowStart.y + 30 });
await command('Input.dispatchMouseEvent', { type: 'mouseReleased', x: rowStart.x, y: rowStart.y + 30, button: 'left', clickCount: 1 });
await sleep(80);
const afterRowResize = JSON.parse(await evaluate(`(() => {
  const table = window.__dafeiyu.store.doc.blocks.find((block) => block.type === 'table');
  return JSON.stringify({ heights: table?.meta?.rowHeights ?? [] });
})()`));
check('表格支持拖动列宽与行高',
  afterColumnResize.widths.length === 3
  && afterColumnResize.widths[0] > afterColumnResize.widths[1]
  && afterRowResize.heights.length === 4
  && afterRowResize.heights[0] > 40,
  JSON.stringify({ afterColumnResize, afterRowResize }));

const insertionModes = JSON.parse(await evaluate(`(async () => {
  const handle = window.__dafeiyu;
  const store = handle.store;
  store.dispatch((doc) => [{
    t: 'insertBlocks',
    at: 0,
    blocks: [
      { id: 'empty_replace', type: 'paragraph', html: '' },
      { id: 'multi_a', type: 'paragraph', html: '多选 A' },
      { id: 'multi_b', type: 'paragraph', html: '多选 B' },
    ],
  }]);
  const insert = async (rows, columns) => {
    document.querySelector('#btn-table').click();
    const picker = document.querySelector('.table-picker');
    [...picker.querySelectorAll('.table-picker-grid button')]
      .find((button) => button.dataset.row === String(rows) && button.dataset.column === String(columns))
      ?.click();
    await new Promise((resolve) => setTimeout(resolve, 60));
  };
  store.setSelection({ blockIds: ['empty_replace'], activeId: 'empty_replace' });
  await insert(2, 2);
  const replaced = store.doc.blocks.find((block) => block.id === 'empty_replace');
  store.setSelection({ blockIds: ['multi_a', 'multi_b'], activeId: 'multi_a' });
  await insert(2, 2);
  const blocks = store.doc.blocks;
  const multiB = blocks.findIndex((block) => block.id === 'multi_b');
  const insertionId = store.selection.activeId;
  const insertionIndex = blocks.findIndex((block) => block.id === insertionId);
  return JSON.stringify({
    emptyReplaced: replaced?.type === 'table' && replaced.meta?.rows?.length === 2,
    multiAfterSelection: Boolean(multiB >= 0 && insertionIndex === multiB + 1),
    insertionIndex,
    multiB,
  });
})()`));
check('空段落原地替换，多选插到整个选区之后', insertionModes.emptyReplaced === true && insertionModes.multiAfterSelection === true, JSON.stringify(insertionModes));

const clipboardGuard = JSON.parse(await evaluate(`(async () => {
  const handle = window.__dafeiyu;
  const table = handle.store.doc.blocks.find((block) => block.type === 'table');
  handle.store.setSelection({ blockIds: [table.id], activeId: table.id });
  await handle.actions.copy();
  const input = document.querySelector('#titlebar-search-input');
  input.focus();
  const before = handle.store.doc.blocks.length;
  const event = new KeyboardEvent('keydown', { key: 'v', ctrlKey: true, bubbles: true, cancelable: true });
  input.dispatchEvent(event);
  return JSON.stringify({ prevented: event.defaultPrevented, unchanged: handle.store.doc.blocks.length === before });
})()`));
check('搜索框内 Ctrl+V 不触发块粘贴', clipboardGuard.prevented === false && clipboardGuard.unchanged === true, JSON.stringify(clipboardGuard));

const ctrlCell = JSON.parse(await evaluate(`(() => {
  const handle = window.__dafeiyu;
  const table = handle.store.doc.blocks.find((block) => block.type === 'table');
  const other = handle.store.doc.blocks.find((block) => block.type !== 'table');
  handle.store.setSelection({ blockIds: [other.id], activeId: other.id });
  const cell = document.querySelector('.block-table td');
  const rect = cell.getBoundingClientRect();
  return JSON.stringify({ x: rect.left + 8, y: rect.top + 8 });
})()`));
await command('Input.dispatchMouseEvent', { type: 'mouseMoved', x: ctrlCell.x, y: ctrlCell.y });
await command('Input.dispatchMouseEvent', { type: 'mousePressed', x: ctrlCell.x, y: ctrlCell.y, button: 'left', clickCount: 1, modifiers: 2 });
await command('Input.dispatchMouseEvent', { type: 'mouseReleased', x: ctrlCell.x, y: ctrlCell.y, button: 'left', clickCount: 1, modifiers: 2 });
await sleep(60);
const ctrlSelected = await evaluate(`(() => {
  const handle = window.__dafeiyu;
  const table = handle.store.doc.blocks.find((block) => block.type === 'table');
  return handle.store.selection.blockIds.includes(table.id);
})()`);
check('Ctrl+点击表格区块选中区块而不是进入单元格', ctrlSelected === true, String(ctrlSelected));

const richCell = JSON.parse(await evaluate(`(async () => {
  const handle = window.__dafeiyu;
  const richId = 'rich_table_test';
  handle.store.dispatch((doc) => [{ t: 'insertBlocks', at: doc.blocks.length, blocks: [{
    id: richId,
    type: 'table',
    html: '',
    meta: { rows: [['颜色测试', '第二格']], header: false, richText: true },
  }] }]);
  await new Promise((resolve) => setTimeout(resolve, 40));
  const table = handle.store.doc.blocks.find((block) => block.id === richId);
  const cell = document.querySelector('.block[data-id="' + richId + '"] td');
  if (!table || !cell) return JSON.stringify({ ok: false });
  cell.focus();
  const range = document.createRange();
  range.selectNodeContents(cell);
  const selection = getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
  document.querySelector('#btn-text-color').click();
  await new Promise((resolve) => setTimeout(resolve, 80));
  const colored = handle.store.doc.blocks.find((block) => block.id === table.id)?.meta?.rows?.[Number(cell.dataset.row)]?.[Number(cell.dataset.column)] ?? '';
  const coloredCell = document.querySelector('.block[data-id="' + table.id + '"] td[data-row="' + cell.dataset.row + '"][data-column="' + cell.dataset.column + '"]');
  const range2 = document.createRange();
  range2.selectNodeContents(coloredCell);
  selection.removeAllRanges();
  selection.addRange(range2);
  document.querySelector('#btn-highlight').click();
  await new Promise((resolve) => setTimeout(resolve, 80));
  const highlighted = handle.store.doc.blocks.find((block) => block.id === table.id)?.meta?.rows?.[Number(cell.dataset.row)]?.[Number(cell.dataset.column)] ?? '';
  return JSON.stringify({
    ok: true,
    colored: colored.includes('color:'),
    highlighted: highlighted.includes('data-highlight'),
    live: Boolean(coloredCell.querySelector('[data-highlight]')),
  });
})()`));
check('表格单元格支持文字颜色和高亮', richCell.ok === true && richCell.colored === true && richCell.highlighted === true && richCell.live === true, JSON.stringify(richCell));

const alignCell = JSON.parse(await evaluate(`(async () => {
  const cell = document.querySelector('.block[data-id="rich_table_test"] td');
  cell.focus();
  const range = document.createRange();
  range.selectNodeContents(cell);
  const selection = getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
  document.querySelector('#btn-center').click();
  await new Promise((resolve) => setTimeout(resolve, 60));
  const table = window.__dafeiyu.store.doc.blocks.find((block) => block.id === 'rich_table_test');
  return JSON.stringify({ align: table?.meta?.cellAligns?.[0]?.[0], style: cell.style.textAlign });
})()`));
check('表格单元格居中', alignCell.align === 'center' && alignCell.style === 'center', JSON.stringify(alignCell));

const undoSetup = JSON.parse(await evaluate(`(async () => {
  const handle = window.__dafeiyu;
  const table = handle.store.doc.blocks.find((block) => block.id === 'rich_table_test');
  const cell = document.querySelector('.block[data-id="rich_table_test"] td');
  const other = handle.store.doc.blocks.find((block) => block.type === 'paragraph');
  handle.store.setSelection({ blockIds: [table.id], activeId: table.id });
  cell.focus();
  cell.appendChild(document.createTextNode('Z'));
  cell.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: 'Z' }));
  document.activeElement?.blur();
  await new Promise((resolve) => setTimeout(resolve, 40));
  handle.store.setSelection({ blockIds: [other.id], activeId: other.id });
  return JSON.stringify({ tableId: table.id });
})()`));
await sleep(80);
await command('Input.dispatchKeyEvent', { type: 'keyDown', key: 'z', code: 'KeyZ', windowsVirtualKeyCode: 90, nativeVirtualKeyCode: 90, modifiers: 2 });
await command('Input.dispatchKeyEvent', { type: 'keyUp', key: 'z', code: 'KeyZ', windowsVirtualKeyCode: 90, nativeVirtualKeyCode: 90, modifiers: 2 });
await sleep(100);
const undoSelection = await evaluate(`window.__dafeiyu.store.selection.blockIds.includes(${JSON.stringify(undoSetup.tableId)})`);
const firstUndoText = await evaluate(`window.__dafeiyu.store.doc.blocks.find((block) => block.id === ${JSON.stringify(undoSetup.tableId)})?.meta?.rows?.[0]?.[0] ?? ''`);
await command('Input.dispatchKeyEvent', { type: 'keyDown', key: 'z', code: 'KeyZ', windowsVirtualKeyCode: 90, nativeVirtualKeyCode: 90, modifiers: 2 });
await command('Input.dispatchKeyEvent', { type: 'keyUp', key: 'z', code: 'KeyZ', windowsVirtualKeyCode: 90, nativeVirtualKeyCode: 90, modifiers: 2 });
await sleep(100);
const secondUndoText = await evaluate(`window.__dafeiyu.store.doc.blocks.find((block) => block.id === ${JSON.stringify(undoSetup.tableId)})?.meta?.rows?.[0]?.[0] ?? ''`);
check('表格输入后第一次 Ctrl+Z 只回选区，第二次才撤销文本', undoSelection === true && firstUndoText.includes('Z') && !secondUndoText.includes('Z'), JSON.stringify({ undoSelection, firstUndoText, secondUndoText }));

const cursorPoint = JSON.parse(await evaluate(`(() => {
  const cell = document.querySelector('.block[data-id="rich_table_test"] td');
  cell.scrollIntoView({ block: 'center' });
  const rect = cell.getBoundingClientRect();
  return JSON.stringify({ x: rect.right - 2, y: rect.top + 8 });
})()`));
await command('Input.dispatchMouseEvent', { type: 'mouseMoved', x: cursorPoint.x, y: cursorPoint.y });
await sleep(60);
const cursorState = await evaluate(`(() => {
  const table = document.querySelector('.block[data-id="rich_table_test"] .doc-table');
  const cell = table.querySelector('td');
  return JSON.stringify({ table: getComputedStyle(table).cursor, cell: getComputedStyle(cell).cursor });
})()`);
const cursor = JSON.parse(cursorState);
check('表格边界悬停不显示缩放光标', cursor.table !== 'col-resize' && cursor.table !== 'row-resize' && cursor.cell !== 'col-resize' && cursor.cell !== 'row-resize', cursorState);

await evaluate(`(() => {
  const handle = window.__dafeiyu;
  const first = handle.store.doc.blocks[0];
  if (first) {
    handle.store.dispatch(() => [{
      t: 'patchBlock',
      id: first.id,
      patch: { type: 'paragraph', html: '', meta: undefined, align: undefined, indent: undefined, fontFamily: undefined, fontSize: undefined },
    }]);
  }
  document.querySelectorAll('.table-picker').forEach((panel) => { panel.hidden = true; });
  return true;
})()`);

finish();
