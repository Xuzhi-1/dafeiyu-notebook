/**
 * 渲染层冒烟：连接远程调试端口，验证键控渲染、编辑、撤销与性能。
 * 用法：先启动 `electron . --remote-debugging-port=9333`，再 `node scripts/smoke.mjs`
 */
import { check, command, evaluate, finish, sleep, waitFor } from './smoke/harness.mjs';

await waitFor('Boolean(window.__dafeiyu?.ready)', 8000);
if (await evaluate('document.documentElement.lang') !== 'zh-CN') {
  await evaluate(`localStorage.setItem('dafeiyu.locale', 'zh-CN'); location.reload()`);
  await waitFor('Boolean(window.__dafeiyu?.ready)', 8000);
}
const clipboardSnapshot = await evaluate('window.__dafeiyu.clipboard?.snapshot ? window.__dafeiyu.clipboard.snapshot() : null');

const initial = JSON.parse(await evaluate(`JSON.stringify({  blocks: document.querySelectorAll('.block').length,
  tableRows: document.querySelectorAll('.doc-table tr').length,
  images: document.querySelectorAll('.block-image img').length,
  outline: document.querySelectorAll('#outline .toc-item').length,
})`));
check('初始渲染（7 块 / 表格 / 图片 / 目录）', initial.blocks === 7 && initial.tableRows === 3 && initial.images === 1 && initial.outline === 2, JSON.stringify(initial));

const keyed = JSON.parse(await evaluate(`(() => {
  const store = window.__dafeiyu.store;
  document.querySelectorAll('.block').forEach((node) => { node.dataset.keep = node.dataset.id; });
  store.dispatch(() => [{ t: 'patchBlock', id: 'b2', patch: { html: '被改写的第二块' } }]);
  const after = [...document.querySelectorAll('.block')];
  return JSON.stringify({
    updated: window.__dafeiyu.lastStats.updated,
    created: window.__dafeiyu.lastStats.created,
    keptOthers: after.filter((node) => node.dataset.id !== 'b2').every((node) => node.dataset.keep === node.dataset.id),
    b2: document.querySelector('[data-id="b2"] .block-content')?.textContent,
  });
})()`));
check('键控更新：只改 1 个节点，其他节点复用', keyed.updated === 1 && keyed.created === 0 && keyed.keptOthers, JSON.stringify(keyed));

const shiftBlockRect = JSON.parse(await evaluate(`(() => {
  const store = window.__dafeiyu.store;
  store.setSelection({ blockIds: ['b1'], activeId: 'b1' });
  const content = document.querySelector('[data-id="b1"] .block-content');
  content.focus();
  const range = document.createRange();
  range.setStart(content.firstChild, 2);
  range.collapse(true);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
  const rect = document.querySelector('[data-id="b3"] .block-content').getBoundingClientRect();
  return JSON.stringify({ x: rect.left + 30, y: rect.top + 15 });
})()`));
await command('Input.dispatchMouseEvent', { type: 'mouseMoved', x: shiftBlockRect.x, y: shiftBlockRect.y });
await command('Input.dispatchMouseEvent', { type: 'mousePressed', x: shiftBlockRect.x, y: shiftBlockRect.y, button: 'left', clickCount: 1, modifiers: 8 });
await command('Input.dispatchMouseEvent', { type: 'mouseReleased', x: shiftBlockRect.x, y: shiftBlockRect.y, button: 'left', clickCount: 1, modifiers: 8 });
await new Promise((resolve) => setTimeout(resolve, 80));
const shiftBlockClick = JSON.parse(await evaluate(`(() => {
  const store = window.__dafeiyu.store;
  const result = {
    ids: store.selection.blockIds,
    domSelection: window.getSelection()?.toString() ?? '',
    selected: [...document.querySelectorAll('.block.is-selected')].map((node) => node.dataset.id),
  };
  store.setSelection({ blockIds: ['b1'], activeId: 'b1' });
  return JSON.stringify(result);
})()`));
check('Shift+点击区块等同普通点击，不产生跨块文本选区', shiftBlockClick.ids.join(',') === 'b3' && shiftBlockClick.domSelection === '' && shiftBlockClick.selected.join(',') === 'b3', JSON.stringify(shiftBlockClick));

const editing = JSON.parse(await evaluate(`(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const store = window.__dafeiyu.store;
  const content = document.querySelector('[data-id="b1"] .block-content');
  content.focus();
  const range = document.createRange();
  range.setStart(content.firstChild, 2);
  range.collapse(true);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
  document.execCommand('insertText', false, '【插】');
  await sleep(600);
  return JSON.stringify({ html: store.doc.blocks.find((block) => block.id === 'b1').html, canUndo: store.canUndo });
})()`));
check('输入同步进模型', editing.html.includes('【插】') && editing.canUndo, JSON.stringify(editing));

const historyUi = await (async () => {
  const original = await evaluate(`(() => {
    const store = window.__dafeiyu.store;
    const content = document.querySelector('[data-id="b1"] .block-content');
    const before = store.doc.blocks.find((block) => block.id === 'b1').html;
    content.focus();
    content.innerHTML = '撤销按钮测试文本';
    content.dispatchEvent(new InputEvent('input', { bubbles: true }));
    return before;
  })()`);
  const click = async (selector) => {
    const rect = await evaluate(`document.querySelector('${selector}').getBoundingClientRect().toJSON()`);
    const x = rect.x + rect.width / 2;
    const y = rect.y + rect.height / 2;
    await command('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
    await command('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
    await command('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
    await new Promise((resolve) => setTimeout(resolve, 80));
  };
  const state = () => evaluate(`(() => {
    const store = window.__dafeiyu.store;
    return JSON.stringify({
      html: store.doc.blocks.find((block) => block.id === 'b1').html,
      dom: document.querySelector('[data-id="b1"] .block-content').innerHTML,
      canUndo: store.canUndo,
      canRedo: store.canRedo,
      undoDisabled: document.querySelector('#btn-undo').disabled,
      redoDisabled: document.querySelector('#btn-redo').disabled,
    });
  })()`).then(JSON.parse);
  await click('#btn-undo');
  const afterUndo = await state();
  await click('#btn-redo');
  const afterRedo = await state();
  await click('#btn-undo');
  const restored = await state();
  return { original, afterUndo, afterRedo, restored };
})();
check('撤销/重做按钮：编辑中立即生效且状态同步', historyUi.afterUndo.html === historyUi.original && historyUi.afterUndo.canRedo && !historyUi.afterUndo.redoDisabled && historyUi.afterRedo.html.includes('撤销按钮测试文本') && !historyUi.afterRedo.undoDisabled && historyUi.restored.html === historyUi.original, JSON.stringify(historyUi));

const split = JSON.parse(await evaluate(`(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const store = window.__dafeiyu.store;
  const content = document.querySelector('[data-id="b1"] .block-content');
  content.focus();
  const range = document.createRange();
  range.setStart(content.firstChild, 3);
  range.collapse(true);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
  content.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true }));
  await sleep(400);
  const newId = store.selection.activeId;
  const newContent = document.querySelector('[data-id="' + newId + '"] .block-content');
  const selection = window.getSelection();
  const activeNew = document.activeElement === newContent
    || Boolean(newContent?.contains(document.activeElement))
    || Boolean(newContent?.contains(selection?.anchorNode ?? null));
  const caretAtStart = Boolean(selection && selection.rangeCount === 1 && selection.getRangeAt(0).collapsed && selection.getRangeAt(0).startOffset === 0);
  return JSON.stringify({ blocks: store.doc.blocks.length, newId, activeNew, caretAtStart });
})()`));
check('Enter 拆分段落：光标在新块开头', split.blocks === 8 && split.activeNew && split.caretAtStart, JSON.stringify(split));

const merge = JSON.parse(await evaluate(`(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const store = window.__dafeiyu.store;
  const second = store.doc.blocks[1];
  const content = document.querySelector('[data-id="' + second.id + '"] .block-content');
  content.focus();
  const range = document.createRange();
  range.setStart(content, 0);
  range.collapse(true);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
  content.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', code: 'Backspace', keyCode: 8, which: 8, bubbles: true, cancelable: true }));
  await sleep(400);
  return JSON.stringify({ blocks: store.doc.blocks.length });
})()`));
check('行首 Backspace 合并段落', merge.blocks === 7, JSON.stringify(merge));

const undo = JSON.parse(await evaluate(`(() => {
  const store = window.__dafeiyu.store;
  const before = store.doc.blocks.length;
  const baseIndex = store.doc.blocks.findIndex((block) => block.id === 'b2');
  const beforeIds = store.doc.blocks.map((block) => block.id);
  store.setSelection({ blockIds: ['b2'], activeId: 'b2' });
  document.querySelector('#btn-add').click();
  const afterAdd = store.doc.blocks.length;
  const newId = store.doc.blocks.find((block) => !beforeIds.includes(block.id))?.id;
  const insertedAfter = store.doc.blocks.findIndex((block) => block.id === newId) === baseIndex + 1;
  const selectionKept = store.selection.activeId === 'b2';
  store.undo();
  return JSON.stringify({ before, afterAdd, afterUndo: store.doc.blocks.length, insertedAfter, selectionKept });
})()`));
check('新增块插入到当前块后面且可撤销', undo.afterAdd === undo.before + 1 && undo.afterUndo === undo.before && undo.insertedAfter && undo.selectionKept, JSON.stringify(undo));

const bold = JSON.parse(await evaluate(`(() => {
  const store = window.__dafeiyu.store;
  const content = document.querySelector('[data-id="b1"] .block-content');
  content.focus();
  const range = document.createRange();
  range.selectNodeContents(content);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
  window.__dafeiyu.actions.bold();
  return JSON.stringify({ html: store.doc.blocks.find((block) => block.id === 'b1').html });
})()`));
check('行内加粗写入模型', /<(b|strong)[\s>]/.test(bold.html), bold.html.slice(0, 60));

const highlight = JSON.parse(await evaluate(`(() => {
  const store = window.__dafeiyu.store;
  const content = document.querySelector('[data-id="b1"] .block-content');
  content.focus();
  const range = document.createRange();
  range.selectNodeContents(content);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
  window.__dafeiyu.actions.highlight();
  return JSON.stringify({ html: store.doc.blocks.find((block) => block.id === 'b1').html });
})()`));
check('高亮写入模型', /background-color/.test(highlight.html), highlight.html.slice(0, 80));


const styleMenus = JSON.parse(await evaluate(`(() => {
  const store = window.__dafeiyu.store;
  const content = document.querySelector('[data-id="b1"] .block-content');
  const selectAll = () => {
    content.focus();
    const range = document.createRange();
    range.selectNodeContents(content);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  };
  selectAll();
  document.querySelector('#btn-text-color-more').click();
  const textPanel = document.querySelector('#text-color-panel');
  const textSwatches = textPanel.querySelectorAll('.color-palette-swatch').length;
  const mousedownPrevented = !document.querySelector('#text-color-palette [data-color="#0000FF"]').dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
  document.querySelector('#text-color-palette [data-color="#0000FF"]').click();
  document.querySelector('#btn-text-color-apply').click();
  const textHtml = store.doc.blocks.find((block) => block.id === 'b1').html.toLowerCase();
  const textLine = getComputedStyle(document.querySelector('#btn-text-color')).color;
  store.undo();
  selectAll();
  document.querySelector('#btn-text-color').click();
  const quickHtml = store.doc.blocks.find((block) => block.id === 'b1').html.toLowerCase();
  const quickLine = getComputedStyle(document.querySelector('#btn-text-color')).color;
  store.undo();
  selectAll();
  document.querySelector('#btn-highlight-more').click();
  const highlightPanel = document.querySelector('#highlight-color-panel');
  const highlightSwatches = highlightPanel.querySelectorAll('.color-palette-swatch').length;
  document.querySelector('#highlight-color-palette [data-color="#FEF08A"]').click();
  document.querySelector('#btn-highlight-color-apply').click();
  const highlightHtml = store.doc.blocks.find((block) => block.id === 'b1').html.toLowerCase();
  const highlightColor = document.documentElement.style.getPropertyValue('--highlight-color').trim().toLowerCase();
  const stillEditing = Boolean(document.activeElement?.closest?.('.block-content'));
  const rangesAfter = window.getSelection()?.rangeCount ?? 0;
  store.undo();
  return JSON.stringify({ textSwatches, highlightSwatches, mousedownPrevented, textHtml, highlightHtml, textLine, quickHtml, quickLine, highlightColor, stillEditing, rangesAfter });
})()`));
check('文字颜色 / 高亮下拉样式', styleMenus.textSwatches === 21 && styleMenus.highlightSwatches === 21 && styleMenus.mousedownPrevented === true && (styleMenus.textHtml.includes('0000ff') || styleMenus.textHtml.includes('rgb(0, 0, 255)')) && (styleMenus.quickHtml.includes('0000ff') || styleMenus.quickHtml.includes('rgb(0, 0, 255)')) && styleMenus.quickLine === 'rgb(0, 0, 255)' && (styleMenus.highlightHtml.includes('fef08a') || styleMenus.highlightHtml.includes('rgb(254, 240, 138)')) && !styleMenus.stillEditing && styleMenus.rangesAfter === 0, JSON.stringify({ textSwatches: styleMenus.textSwatches, highlightSwatches: styleMenus.highlightSwatches, mousedownPrevented: styleMenus.mousedownPrevented, textHtml: styleMenus.textHtml, quickHtml: styleMenus.quickHtml, quickLine: styleMenus.quickLine, highlightHtml: styleMenus.highlightHtml }));

const colorOverride = JSON.parse(await evaluate(`(async () => {
  const store = window.__dafeiyu.store;
  store.dispatch(() => [{ t: 'patchBlock', id: 'b1', patch: { html: 'AAA BBB <span style="color:#c00000">CC</span> DDD' } }]);
  const content = document.querySelector('[data-id="b1"] .block-content');
  content.focus();
  const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT);
  const nodes = [];
  let node;
  let full = '';
  while ((node = walker.nextNode())) {
    nodes.push({ node, start: full.length });
    full += node.data;
  }
  const start = full.indexOf('AAA BBB C');
  const end = start + 'AAA BBB C'.length;
  const at = (index) => nodes.find((item) => index < item.start + item.node.data.length) || nodes[nodes.length - 1];
  const from = at(start);
  const to = at(end);
  const range = document.createRange();
  range.setStart(from.node, start - from.start);
  range.setEnd(to.node, end - to.start);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
  await new Promise((resolve) => setTimeout(resolve, 20));
  document.querySelector('#btn-text-color-more').click();
  document.querySelector('#text-color-palette [data-color="#9CA3AF"]').click();
  document.querySelector('#btn-text-color-apply').click();
  await new Promise((resolve) => setTimeout(resolve, 20));
  const next = document.querySelector('[data-id="b1"] .block-content');
  const walker2 = document.createTreeWalker(next, NodeFilter.SHOW_TEXT);
  let target;
  while ((node = walker2.nextNode())) {
    if (node.data === 'C') {
      target = node;
      break;
    }
  }
  const color = target ? getComputedStyle(target.parentElement).color : '';
  store.undo();
  store.undo();
  return JSON.stringify({ color, html: next.innerHTML });
})()`));
check('text color overrides existing color', colorOverride.color === 'rgb(156, 163, 175)', JSON.stringify(colorOverride));

const crossBlockColor = JSON.parse(await evaluate(`(async () => {
  const store = window.__dafeiyu.store;
  if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  window.getSelection()?.removeAllRanges();
  store.dispatch(() => [
    { t: 'patchBlock', id: 'b1', patch: { html: 'FIRST_BLOCK' } },
    { t: 'patchBlock', id: 'b2', patch: { html: 'SECOND_BLOCK' } },
  ]);
  await new Promise((resolve) => setTimeout(resolve, 30));
  const first = document.querySelector('[data-id="b1"] .block-content');
  const second = document.querySelector('[data-id="b2"] .block-content');
  const range = document.createRange();
  range.setStart(first, 0);
  range.setEnd(second, second.childNodes.length);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
  document.querySelector('#btn-text-color-more').click();
  document.querySelector('#text-color-palette [data-color="#9CA3AF"]').click();
  document.querySelector('#btn-text-color-apply').click();
  const firstHtml = document.querySelector('[data-id="b1"] .block-content').innerHTML;
  const secondHtml = document.querySelector('[data-id="b2"] .block-content').innerHTML;
  store.undo();
  store.undo();
  return JSON.stringify({ first: firstHtml, second: secondHtml });
})()`));
check('text color applies across blocks', crossBlockColor.first.includes('FIRST_BLOCK') && crossBlockColor.first.includes('156, 163, 175') && crossBlockColor.second.includes('SECOND_BLOCK') && crossBlockColor.second.includes('156, 163, 175'), JSON.stringify(crossBlockColor));

const snapshotColor = JSON.parse(await evaluate(`(async () => {
  const store = window.__dafeiyu.store;
  if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  window.getSelection()?.removeAllRanges();
  store.dispatch(() => [{ t: 'patchBlock', id: 'b1', patch: { html: 'SNAPSHOT_TEXT' } }]);
  await new Promise((resolve) => setTimeout(resolve, 30));
  const content = document.querySelector('[data-id="b1"] .block-content');
  const range = document.createRange();
  range.selectNodeContents(content);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
  document.querySelector('#btn-text-color-more').click();
  store.dispatch(() => [{ t: 'patchBlock', id: 'b1', patch: { html: 'SNAPSHOT_TEXT!' } }]);
  await new Promise((resolve) => setTimeout(resolve, 30));
  document.querySelector('#text-color-palette [data-color="#9CA3AF"]').click();
  document.querySelector('#btn-text-color-apply').click();
  const html = document.querySelector('[data-id="b1"] .block-content').innerHTML;
  store.undo();
  store.undo();
  return JSON.stringify({ html });
})()`));
check('text selection survives panel rerender', snapshotColor.html.includes('SNAPSHOT_TEXT') && snapshotColor.html.includes('156, 163, 175'), JSON.stringify(snapshotColor));

const hlModes = JSON.parse(await evaluate(`(() => {
  const store = window.__dafeiyu.store;
  const content = document.querySelector('[data-id="b1"] .block-content');
  const selectAll = () => {
    content.focus();
    const range = document.createRange();
    range.selectNodeContents(content);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  };
  const openPanel = () => {
    const panel = document.querySelector('#highlight-color-panel');
    if (panel.hidden) document.querySelector('#btn-highlight-more').click();
  };
  const applyMode = (mode) => {
    selectAll();
    openPanel();
    document.querySelector('[data-highlight-mode="' + mode + '"]').click();
    const active = document.querySelector('[data-highlight-mode="' + mode + '"]').classList.contains('is-active');
    document.querySelector('#highlight-color-palette [data-color="#FEF08A"]').click();
    document.querySelector('#btn-highlight-color-apply').click();
    const html = store.doc.blocks.find((block) => block.id === 'b1').html;
    store.undo();
    return { html, active };
  };
  const wavy = applyMode('wavy');
  const solid = applyMode('solid');
  const dashed = applyMode('dashed');
  const marker = applyMode('marker');
  const modes = document.querySelectorAll('[data-highlight-mode]').length;
  const single = (html) => (html.match(/data-highlight="/g) || []).length === 1;
  return JSON.stringify({
    modes,
    wavy: wavy.active && wavy.html.includes('data-highlight="wavy"') && wavy.html.includes('wavy') && wavy.html.includes('text-underline-offset: 4px') && single(wavy.html),
    solid: solid.active && solid.html.includes('data-highlight="solid"') && solid.html.includes('solid') && single(solid.html),
    dashed: dashed.active && dashed.html.includes('data-highlight="dashed"') && dashed.html.includes('dashed') && single(dashed.html),
    marker: marker.active && marker.html.includes('data-highlight="marker"') && marker.html.includes('background-color') && single(marker.html),
  });
})()`));
check('高亮四种模式可切换且不叠加', hlModes.modes === 4 && hlModes.wavy && hlModes.solid && hlModes.dashed && hlModes.marker, JSON.stringify(hlModes));


const blockHighlight = JSON.parse(await evaluate(`(() => {
  const store = window.__dafeiyu.store;
  const html = (id) => store.doc.blocks.find((block) => block.id === id).html;
  const content = document.querySelector('[data-id="b1"] .block-content');
  content.focus();
  const range = document.createRange();
  range.selectNodeContents(content);
  range.collapse(true);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
  const before = html('b1');
  document.querySelector('#btn-highlight').click();
  const editingNoop = html('b1') === before;
  content.blur();
  const beforeFirst = html('b1');
  const beforeSecond = html('b2');
  store.setSelection({ blockIds: ['b1', 'b2'], activeId: 'b2' });
  document.querySelector('#btn-highlight').click();
  const first = html('b1');
  const second = html('b2');
  const applied = first.includes('data-highlight="marker"')
    && second.includes('data-highlight="marker"')
    && (first.match(/data-highlight="/g) || []).length === 1
    && (second.match(/data-highlight="/g) || []).length === 1;
  store.undo();
  const undone = html('b1') === beforeFirst && html('b2') === beforeSecond;
  return JSON.stringify({ editingNoop, applied, undone });
})()`));
check('编辑态无选区不响应 / 区块选择整块高亮', blockHighlight.editingNoop && blockHighlight.applied && blockHighlight.undone, JSON.stringify(blockHighlight));


const blockPanelHighlight = JSON.parse(await evaluate(`(() => {
  const store = window.__dafeiyu.store;
  const html = (id) => store.doc.blocks.find((block) => block.id === id).html;
  document.activeElement?.blur();
  store.setSelection({ blockIds: ['b1', 'b2'], activeId: 'b2' });
  const beforeFirst = html('b1');
  const beforeSecond = html('b2');
  document.querySelector('#btn-highlight-more').click();
  document.querySelector('[data-highlight-mode="wavy"]').click();
  document.querySelector('#btn-highlight-color-apply').click();
  const applied = html('b1').includes('data-highlight="wavy"') && html('b2').includes('data-highlight="wavy"');
  store.undo();
  return JSON.stringify({ applied, undone: html('b1') === beforeFirst && html('b2') === beforeSecond });
})()`));
check('区块选择时面板应用高亮', blockPanelHighlight.applied && blockPanelHighlight.undone, JSON.stringify(blockPanelHighlight));


const deleteHighlight = JSON.parse(await evaluate(`(() => {
  const store = window.__dafeiyu.store;
  const html = (id) => store.doc.blocks.find((block) => block.id === id).html;
  const content = document.querySelector('[data-id="b1"] .block-content');
  const selectAll = () => {
    content.focus();
    const range = document.createRange();
    range.selectNodeContents(content);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  };
  selectAll();
  document.querySelector('#btn-highlight-more').click();
  document.querySelector('#btn-highlight-color-apply').click();
  const applied = html('b1').includes('data-highlight');
  selectAll();
  document.querySelector('#btn-highlight-more').click();
  document.querySelector('#btn-highlight-delete').click();
  const textRemoved = !html('b1').includes('data-highlight');
  const selectionAfterDelete = window.getSelection();
  const textCollapsed = !selectionAfterDelete || selectionAfterDelete.rangeCount === 0;
  const stillEditing = Boolean(document.activeElement?.closest?.('.block-content'));
  store.undo();
  store.undo();
  content.blur();
  store.setSelection({ blockIds: ['b1', 'b2'], activeId: 'b2' });
  const beforeFirst = html('b1');
  const beforeSecond = html('b2');
  document.querySelector('#btn-highlight').click();
  const blockApplied = html('b1').includes('data-highlight') && html('b2').includes('data-highlight');
  const appliedFirst = html('b1');
  const appliedSecond = html('b2');
  document.querySelector('#btn-highlight-more').click();
  document.querySelector('#btn-highlight-delete').click();
  const blockRemoved = !html('b1').includes('data-highlight') && !html('b2').includes('data-highlight');
  store.undo();
  const deleteUndone = html('b1') === appliedFirst && html('b2') === appliedSecond;
  store.undo();
  const undone = html('b1') === beforeFirst && html('b2') === beforeSecond;
  return JSON.stringify({ applied, textRemoved, textCollapsed, stillEditing, blockApplied, blockRemoved, deleteUndone, undone });
})()`));
check('删除高亮：文字选区 / 区块', deleteHighlight.applied && deleteHighlight.textRemoved && deleteHighlight.textCollapsed && !deleteHighlight.stillEditing && deleteHighlight.blockApplied && deleteHighlight.blockRemoved && deleteHighlight.deleteUndone && deleteHighlight.undone, JSON.stringify(deleteHighlight));

const caretToggle = JSON.parse(await evaluate(`(() => {
  const toggle = (buttonId, panelId) => {
    const button = document.querySelector('#' + buttonId);
    const panel = document.querySelector('#' + panelId);
    if (!panel.hidden) button.click();
    button.click();
    const opened = !panel.hidden;
    button.click();
    const closed = panel.hidden;
    return opened && closed;
  };
  return JSON.stringify({
    text: toggle('btn-text-color-more', 'text-color-panel'),
    highlight: toggle('btn-highlight-more', 'highlight-color-panel'),
    mark: toggle('btn-mark-more', 'mark-panel'),
    comment: toggle('btn-comment-more', 'comment-panel'),
  });
})()`));
check('四个下拉再次点击可收起', caretToggle.text && caretToggle.highlight && caretToggle.mark && caretToggle.comment, JSON.stringify(caretToggle));

const align = JSON.parse(await evaluate(`(() => {
  const store = window.__dafeiyu.store;
  store.setSelection({ blockIds: ['b2'], activeId: 'b2' });
  window.__dafeiyu.actions.center();
  return JSON.stringify({ align: store.doc.blocks.find((block) => block.id === 'b2').align });
})()`));
check('段落居中对齐', align.align === 'center', JSON.stringify(align));

const group = JSON.parse(await evaluate(`(() => {
  const store = window.__dafeiyu.store;
  window.__dafeiyu.actions.selectAll();
  window.__dafeiyu.actions.group();
  const afterGroup = store.doc.groups.length;
  window.__dafeiyu.actions.ungroup();
  return JSON.stringify({ afterGroup, afterUngroup: store.doc.groups.length });
})()`));
check('分组 / 取消分组', group.afterGroup === 1 && group.afterUngroup === 0, JSON.stringify(group));

const marquee = JSON.parse(await evaluate(`(() => {
  const store = window.__dafeiyu.store;
  store.setSelection({ blockIds: [], activeId: null });
  const paper = document.querySelector('#blocks');
  const rect = paper.getBoundingClientRect();
  const blocks = [...paper.querySelectorAll('.block')];
  const first = blocks[0].getBoundingClientRect();
  const third = blocks[2].getBoundingClientRect();
  const opts = { bubbles: true, cancelable: true, button: 0, buttons: 1, pointerId: 71, isPrimary: true, pointerType: 'mouse' };
  paper.dispatchEvent(new PointerEvent('pointerdown', { ...opts, clientX: rect.left + 10, clientY: third.bottom + 6 }));
  document.dispatchEvent(new PointerEvent('pointermove', { ...opts, clientX: rect.left + 260, clientY: first.top - 4 }));
  document.dispatchEvent(new PointerEvent('pointerup', { ...opts, buttons: 0, clientX: rect.left + 260, clientY: first.top - 4 }));
  return JSON.stringify({ selected: store.selection.blockIds.length });
})()`));
check('框选多块', marquee.selected >= 2, JSON.stringify(marquee));

const drag = JSON.parse(await evaluate(`(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const store = window.__dafeiyu.store;
  store.setSelection({ blockIds: [], activeId: null });
  const order = () => store.doc.blocks.map((block) => block.id);
  if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  await sleep(500);
  const before = order();
  const handle = document.querySelector('[data-id="b1"] .block-handle');
  const from = handle.getBoundingClientRect();
  const third = store.doc.blocks[2];
  const target = document.querySelector('[data-id="' + third.id + '"]').getBoundingClientRect();
  const opts = { bubbles: true, cancelable: true, button: 0, buttons: 1, pointerId: 81, isPrimary: true, pointerType: 'mouse' };
  handle.dispatchEvent(new PointerEvent('pointerdown', { ...opts, clientX: from.left + 4, clientY: from.top + 6 }));
  document.dispatchEvent(new PointerEvent('pointermove', { ...opts, clientX: from.left + 4, clientY: target.bottom - 2 }));
  await sleep(60);
  document.dispatchEvent(new PointerEvent('pointerup', { ...opts, buttons: 0, clientX: from.left + 4, clientY: target.bottom - 2 }));
  await sleep(200);
  const after = order();
  const undoneOnce = store.undo();
  const afterOneUndo = order();
  const undoneTwice = store.undo();
  const afterTwoUndo = order();
  return JSON.stringify({ before, after, undoneOnce, afterOneUndo, undoneTwice, afterTwoUndo });
})()`));
check('拖拽排序后撤销可还原', drag.after.join(',') !== drag.before.join(',') && drag.afterOneUndo.join(',') === drag.before.join(','), JSON.stringify(drag));

const toc = JSON.parse(await evaluate(`(() => {
  const store = window.__dafeiyu.store;
  const actions = window.__dafeiyu.actions;
  const blocks = Array.from({ length: 40 }, (_, index) => ({ id: 'tail_' + index, type: 'paragraph', html: '尾部块 ' + (index + 1) }));
  store.dispatch((doc) => [{ t: 'insertBlocks', at: doc.blocks.length, blocks }]);
  actions.tocAdd(['tail_39']);
  actions.tocAdd(['tail_10']);
  const last = store.doc.toc.find((entry) => entry.blockId === 'tail_39');
  const middle = store.doc.toc.find((entry) => entry.blockId === 'tail_10');
  const ws = document.querySelector('#workspace');
  actions.jump(last.id);
  const lastRect = document.querySelector('[data-id="tail_39"]').getBoundingClientRect();
  const wsRect = ws.getBoundingClientRect();
  const lastVisible = lastRect.bottom > wsRect.top && lastRect.top < wsRect.bottom;
  const selectedLast = store.selection.blockIds.includes('tail_39');
  actions.jump(middle.id);
  const selectedMiddle = store.selection.blockIds.includes('tail_10');
  const topOffset = Math.round(document.querySelector('[data-id="tail_10"]').getBoundingClientRect().top - ws.getBoundingClientRect().top);
  return JSON.stringify({ tocCount: store.doc.toc.length, lastVisible, selectedLast, selectedMiddle, topOffset, viewport: ws.clientHeight });
})()`));
check('目录加入 / 跳转（22% 偏上、末项可见、保留选区）', toc.tocCount >= 4 && toc.lastVisible === true && toc.selectedLast === true && toc.selectedMiddle === true && Math.abs(toc.topOffset - Math.round(toc.viewport * 0.22)) <= 6, JSON.stringify(toc));

const tocTree = JSON.parse(await evaluate(`(() => {
  const store = window.__dafeiyu.store;
  const actions = window.__dafeiyu.actions;
  const first = store.doc.toc.find((entry) => entry.blockId === 'b1');
  const last = store.doc.toc.find((entry) => entry.blockId === 'tail_39');
  actions.tocMove(last.id, first.id, 'inside');
  const depth = document.querySelector('[data-toc-id="' + last.id + '"]')?.dataset.depth;
  actions.tocToggle(first.id);
  const visibleWhileCollapsed = Boolean(document.querySelector('[data-toc-id="' + last.id + '"]'));
  actions.tocToggle(first.id);
  const visibleAfterExpand = Boolean(document.querySelector('[data-toc-id="' + last.id + '"]'));
  return JSON.stringify({ depth, visibleWhileCollapsed, visibleAfterExpand });
})()`));
check('目录三段落点（成为子级）与折叠/展开', tocTree.depth === '1' && tocTree.visibleWhileCollapsed === false && tocTree.visibleAfterExpand === true, JSON.stringify(tocTree));

const tocEdit = JSON.parse(await evaluate(`(() => {
  const store = window.__dafeiyu.store;
  const actions = window.__dafeiyu.actions;
  const middle = store.doc.toc.find((entry) => entry.blockId === 'tail_10');
  actions.tocRename(middle.id, '改名后的目录');
  const renamed = store.doc.toc.find((entry) => entry.id === middle.id)?.label;
  const before = store.doc.toc.length;
  actions.tocRemove(middle.id);
  return JSON.stringify({ renamed, before, after: store.doc.toc.length });
})()`));
check('目录重命名与移除', tocEdit.renamed === '改名后的目录' && tocEdit.after === tocEdit.before - 1, JSON.stringify(tocEdit));

const tocDeleteUi = JSON.parse(await evaluate(`(() => {
  const item = document.querySelector('.toc-item');
  const hasHoverDelete = Boolean(document.querySelector('[data-toc-remove]'));
  item.dispatchEvent(new MouseEvent('contextmenu', {
    bubbles: true,
    cancelable: true,
    clientX: 120,
    clientY: 160,
  }));
  const labels = [...document.querySelectorAll('.context-menu-item')].map((button) => button.textContent.trim());
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  return JSON.stringify({ hasHoverDelete, labels, closed: !document.querySelector('.context-menu') });
})()`));
check('目录右键菜单删除，不再悬停显示删除按钮', tocDeleteUi.hasHoverDelete === false && tocDeleteUi.labels.some((label) => label === '删除此目录' || /^删除 \d+ 个目录$/.test(label)) && tocDeleteUi.closed === true, JSON.stringify(tocDeleteUi));

const outlineShiftRect = JSON.parse(await evaluate(`(() => {
  const items = [...document.querySelectorAll('.toc-item')];
  const label = items[0].querySelector('.toc-label');
  const range = document.createRange();
  range.selectNodeContents(label);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
  const rect = items[items.length - 1].getBoundingClientRect();
  return JSON.stringify({ x: rect.left + 40, y: rect.top + 10 });
})()`));
await command('Input.dispatchMouseEvent', { type: 'mouseMoved', x: outlineShiftRect.x, y: outlineShiftRect.y });
await command('Input.dispatchMouseEvent', { type: 'mousePressed', x: outlineShiftRect.x, y: outlineShiftRect.y, button: 'left', clickCount: 1, modifiers: 8 });
await command('Input.dispatchMouseEvent', { type: 'mouseReleased', x: outlineShiftRect.x, y: outlineShiftRect.y, button: 'left', clickCount: 1, modifiers: 8 });
await new Promise((resolve) => setTimeout(resolve, 80));
const outlineShift = JSON.parse(await evaluate(`(() => {
  const store = window.__dafeiyu.store;
  const result = {
    domSelection: window.getSelection()?.toString() ?? '',
    ids: store.selection.blockIds,
  };
  store.setSelection({ blockIds: ['b1'], activeId: 'b1' });
  return JSON.stringify(result);
})()`));
check('Shift+点击目录项不产生文本选区并正常跳转', outlineShift.domSelection === '' && outlineShift.ids.join(',') === 'b7', JSON.stringify(outlineShift));

const tocBatch = JSON.parse(await evaluate(`(() => {
  const store = window.__dafeiyu.store;
  const actions = window.__dafeiyu.actions;
  const parent = store.doc.toc.find((entry) => entry.blockId === 'b1');
  actions.tocAdd(['b2']);
  const child = store.doc.toc[store.doc.toc.length - 1];
  actions.tocMove(child.id, parent.id, 'inside');
  const item = document.querySelector(\`[data-toc-id="\${parent.id}"]\`);
  item.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, altKey: true }));
  const selected = [...document.querySelectorAll('.toc-item.is-selected')].map((node) => node.dataset.tocId);
  item.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 120, clientY: 160 }));
  const label = document.querySelector('.context-menu-item')?.textContent.trim() ?? '';
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  actions.tocRemove(child.id);
  item.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  return JSON.stringify({ count: selected.length, label });
})()`));
check('Alt+点击目录选中父项及子项，右键显示批量删除数量', tocBatch.count >= 2 && tocBatch.label === `删除 ${tocBatch.count} 个目录`, JSON.stringify(tocBatch));

const notes = JSON.parse(await evaluate(`(() => {
  const store = window.__dafeiyu.store;
  const actions = window.__dafeiyu.actions;
  store.setSelection({ blockIds: ['b3'], activeId: 'b3' });
  const marked = actions.mark();
  const badge = document.querySelector('[data-id="b3"] .block-badge')?.textContent ?? '';
  const markOf = (id) => store.doc.annotations.find((item) => item.type === 'mark' && item.anchor.blockId === id)?.mark;
  const markedValue = markOf('b3')?.icon ?? '';
  const added = actions.comment('这里需要再确认一下');
  const count = actions.noteCount('b3');
  const buttonText = document.querySelector('[data-id="b3"] .block-comment-btn')?.textContent?.trim() ?? '';
  actions.openNotes('b3');
  const draft = document.querySelector('.comment-line.is-editing .comment-line-text');
  const panelVisible = draft?.getAttribute('contenteditable') === 'true';
  document.querySelector('.comment-inline-actions [data-note-close]')?.click();
  const displayRows = document.querySelectorAll('.comment-display[data-block-id="b3"] .comment-line').length;
  document.querySelector('.comment-display[data-block-id="b3"] .comment-line')?.click();
  document.querySelector('.comment-inline-actions [data-note-delete]')?.click();
  const afterRemove = actions.noteCount('b3');
  return JSON.stringify({ marked, markedValue, added, count, buttonText, panelVisible, displayRows, afterRemove, badge });
})()`));
check('标注徽章 / 注释面板 / 删除注释', notes.marked === true && notes.markedValue === 'star' && notes.badge.length > 0 && notes.count === 1 && notes.buttonText.includes('💬') && notes.panelVisible && notes.displayRows === 1 && notes.afterRemove === 0, JSON.stringify(notes));


const multilineNote = JSON.parse(await evaluate(`(() => {
  const store = window.__dafeiyu.store;
  store.setSelection({ blockIds: ['b7'], activeId: 'b7' });
  window.__dafeiyu.actions.openNotes('b7');
  const editor = document.querySelector('.comment-line.is-editing .comment-line-text');
  editor.innerText = ['第一行', '第二行', '第三行'].join(String.fromCharCode(10));
  document.querySelector('.comment-inline-actions [data-note-add]').click();
  const note = store.doc.annotations.filter((item) => item.type === 'comment' && item.anchor.blockId === 'b7').slice(-1)[0];
  const display = document.querySelector('.comment-display[data-block-id="b7"] .comment-line-text');
  const style = display ? getComputedStyle(display) : null;
  const lineHeight = style ? Number.parseFloat(style.lineHeight) : 0;
  const whiteSpace = style?.getPropertyValue('white-space') ?? '';
  const height = display?.getBoundingClientRect().height ?? 0;
  document.querySelector('.comment-display[data-block-id="b7"] .comment-line')?.click();
  document.querySelector('.comment-inline-actions [data-note-delete]')?.click();
  return JSON.stringify({
    html: note?.html,
    text: display?.textContent,
    whiteSpace,
    multiline: height > lineHeight * 2.5,
  });
})()`));
check('多行注释保留换行且显示一致', multilineNote.html === '第一行\n第二行\n第三行' && multilineNote.text === '第一行\n第二行\n第三行' && multilineNote.whiteSpace === 'pre-wrap' && multilineNote.multiline === true, JSON.stringify(multilineNote));


const enterBehavior = JSON.parse(await evaluate(`(() => {
  const store = window.__dafeiyu.store;
  store.setSelection({ blockIds: ['b7'], activeId: 'b7' });
  window.__dafeiyu.actions.openNotes('b7');
  const editor = document.querySelector('.comment-line.is-editing .comment-line-text');
  editor.innerText = 'enter saves';
  const enter = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
  editor.dispatchEvent(enter);
  const saved = store.doc.annotations.some((item) => item.type === 'comment' && item.anchor.blockId === 'b7' && item.html === 'enter saves');
  const enterPrevented = enter.defaultPrevented;

  window.__dafeiyu.actions.openNotes('b7');
  const editor2 = document.querySelector('.comment-line.is-editing .comment-line-text');
  const shift = new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, bubbles: true, cancelable: true });
  editor2.dispatchEvent(shift);
  const stillEditing = Boolean(document.querySelector('.comment-line.is-editing'));
  document.querySelector('.comment-inline-actions [data-note-close]')?.click();
  return JSON.stringify({ saved, enterPrevented, shiftPrevented: shift.defaultPrevented, stillEditing });
})()`));
check('注释 Enter 提交 / Shift+Enter 换行', enterBehavior.saved === true && enterBehavior.enterPrevented === true && enterBehavior.shiftPrevented === true && enterBehavior.stillEditing === true, JSON.stringify(enterBehavior));

const groupNote = JSON.parse(await evaluate(`(() => {
  const store = window.__dafeiyu.store;
  const actions = window.__dafeiyu.actions;
  store.setSelection({ blockIds: ['b4', 'b5'], activeId: 'b5' });
  const ok = actions.groupComment('这两块是一组资料');
  const note = store.doc.annotations.filter((item) => item.type === 'comment' && item.anchor.blockId === 'b4').slice(-1)[0];
  return JSON.stringify({ ok, groupIds: note?.anchor.blockIds ?? null });
})()`));
check('组注释记录成员', groupNote.ok === true && groupNote.groupIds?.length === 2, JSON.stringify(groupNote));

const extensionOrder = JSON.parse(await evaluate(`(() => {
  const store = window.__dafeiyu.store;
  const original = store.doc.blocks.map((block) => block.id);
  const moved = [original[4], ...original.filter((_, index) => index !== 4)];
  store.dispatch(() => [{ t: 'patchDoc', patch: { blocks: moved.map((id) => store.doc.blocks.find((block) => block.id === id)) } }]);
  const dom = [...document.querySelectorAll('#blocks > .block')].map((block) => block.dataset.id);
  const display = document.querySelector('.comment-display[data-block-id="b5"]');
  const followed = display?.previousElementSibling?.dataset.id === 'b5';
  const extension = display?.dataset.blockExtension === 'b5';
  store.dispatch(() => [{ t: 'patchDoc', patch: { blocks: original.map((id) => store.doc.blocks.find((block) => block.id === id)) } }]);
  return JSON.stringify({ doc: moved, dom, followed, extension });
})()`));
check('块重排后注释仍跟随所属块', extensionOrder.doc.every((id, index) => extensionOrder.dom[index] === id) && extensionOrder.followed === true && extensionOrder.extension === true, JSON.stringify(extensionOrder));

const groupThread = JSON.parse(await evaluate(`(() => {
  const store = window.__dafeiyu.store;
  const groupCount = () => store.doc.annotations.filter((item) => item.type === 'comment' && item.anchor.blockIds?.length).length;
  store.setSelection({ blockIds: ['b4', 'b5'], activeId: 'b5' });
  const before = groupCount();
  document.querySelector('[data-id="b5"] .block-group-comment-btn').click();
  const editor = document.querySelector('.comment-line.is-editing .comment-line-text');
  const opened = Boolean(editor);
  if (editor) editor.innerText = 'second group note';
  document.querySelector('.comment-inline-actions [data-note-add]')?.click();
  const texts = [...document.querySelectorAll('.comment-display[data-block-id="b5"] .comment-line-text')].map((el) => el.textContent);
  return JSON.stringify({ before, after: groupCount(), opened, texts, selection: store.selection.blockIds.length });
})()`));
check('完整的已有组可以继续追加组注释', groupThread.before === 1 && groupThread.after === 2 && groupThread.opened === true && groupThread.texts[groupThread.texts.length - 1] === 'second group note' && groupThread.selection === 0, JSON.stringify(groupThread));

const overlapGroup = JSON.parse(await evaluate(`(() => {
  const store = window.__dafeiyu.store;
  const groupCount = () => store.doc.annotations.filter((item) => item.type === 'comment' && item.anchor.blockIds?.length).length;
  store.setSelection({ blockIds: ['b5', 'b6'], activeId: 'b6' });
  const before = groupCount();
  document.querySelector('[data-id="b6"] .block-group-comment-btn').click();
  return JSON.stringify({ before, after: groupCount(), editing: Boolean(document.querySelector('.comment-line.is-editing')) });
})()`));
check('已组注释区块不能与其他块组成新组注释', overlapGroup.before === overlapGroup.after && overlapGroup.editing === false, JSON.stringify(overlapGroup));

const nonContiguousGroup = JSON.parse(await evaluate(`(() => {
  const store = window.__dafeiyu.store;
  const groupCount = () => store.doc.annotations.filter((item) => item.type === 'comment' && item.anchor.blockIds?.length).length;
  store.setSelection({ blockIds: ['b1', 'b3', 'b6'], activeId: 'b6' });
  const before = groupCount();
  document.querySelector('[data-id="b6"] .block-group-comment-btn').click();
  return JSON.stringify({ before, after: groupCount(), editing: Boolean(document.querySelector('.comment-line.is-editing')) });
})()`));
check('非连续区块不能创建组注释', nonContiguousGroup.before === nonContiguousGroup.after && nonContiguousGroup.editing === false, JSON.stringify(nonContiguousGroup));

const altSelectionMode = JSON.parse(await evaluate(`(() => {
  const store = window.__dafeiyu.store;
  const previous = store.selection;
  store.setSelection({ blockIds: ['b1'], activeId: 'b1' });
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Alt', bubbles: true, cancelable: true }));
  const active = document.body.classList.contains('is-alt-selecting');
  const block = document.querySelector('[data-id="b2"]');
  const rect = block.getBoundingClientRect();
  const opts = { bubbles: true, cancelable: true, button: 0, buttons: 1, pointerId: 211, isPrimary: true, pointerType: 'mouse', altKey: true, clientX: rect.left + 40, clientY: rect.top + 8 };
  block.dispatchEvent(new PointerEvent('pointerdown', opts));
  block.dispatchEvent(new PointerEvent('pointerup', { ...opts, buttons: 0 }));
  const selected = store.selection.blockIds.slice();
  document.dispatchEvent(new KeyboardEvent('keyup', { key: 'Alt', bubbles: true }));
  const released = !document.body.classList.contains('is-alt-selecting');
  store.setSelection(previous);
  return JSON.stringify({ active, selected, released });
})()`));
check('Alt 选择模式只切换当前区块', altSelectionMode.active === true && altSelectionMode.selected.includes('b1') && altSelectionMode.selected.includes('b2') && altSelectionMode.released === true, JSON.stringify(altSelectionMode));


const altDragInside = JSON.parse(await evaluate(`(() => {
  const store = window.__dafeiyu.store;
  store.setSelection({ blockIds: ['b1'], activeId: 'b1' });
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Alt', bubbles: true, cancelable: true }));
  const startEl = document.querySelector('[data-id="b2"]');
  const endEl = document.querySelector('[data-id="b3"]');
  const start = startEl.getBoundingClientRect();
  const end = endEl.getBoundingClientRect();
  const opts = { bubbles: true, cancelable: true, button: 0, buttons: 1, pointerId: 212, isPrimary: true, pointerType: 'mouse', altKey: true };
  startEl.dispatchEvent(new PointerEvent('pointerdown', { ...opts, clientX: start.left + 30, clientY: start.top + 8 }));
  document.dispatchEvent(new PointerEvent('pointermove', { ...opts, clientX: end.left + 30, clientY: end.bottom - 4 }));
  document.dispatchEvent(new PointerEvent('pointerup', { ...opts, buttons: 0, clientX: end.left + 30, clientY: end.bottom - 4 }));
  const selected = store.selection.blockIds.slice();
  document.dispatchEvent(new KeyboardEvent('keyup', { key: 'Alt', bubbles: true }));
  return JSON.stringify({ selected });
})()`));
check('Alt 从区块内拖动也能框选', altDragInside.selected.includes('b1') && altDragInside.selected.includes('b2') && altDragInside.selected.includes('b3'), JSON.stringify(altDragInside));

const outsidePaper = JSON.parse(await evaluate(`(() => {
  const store = window.__dafeiyu.store;
  store.setSelection({ blockIds: ['b1'], activeId: 'b1' });
  const workspace = document.querySelector('#workspace');
  workspace.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 }));
  return JSON.stringify({ ids: store.selection.blockIds, active: store.selection.activeId });
})()`));
check('点击纸张外灰色区域取消区块选择', outsidePaper.ids.length === 0 && outsidePaper.active === null, JSON.stringify(outsidePaper));

const outlineResize = JSON.parse(await evaluate(`(() => {
  const handle = document.querySelector('#outline-resizer');
  const width = () => document.querySelector('#outline').getBoundingClientRect().width;
  const drag = (to) => {
    const from = width();
    handle.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerId: 1, clientX: from }));
    document.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerId: 1, clientX: to }));
    document.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 1, clientX: to }));
    return width();
  };
  const min = drag(0);
  const max = drag(1000);
  const mid = drag(300);
  const saved = localStorage.getItem('dafeiyu-next.outline-width');
  const cursor = getComputedStyle(handle).cursor;
  drag(220);
  return JSON.stringify({ min, max, mid, saved, cursor });
})()`));
check('目录宽度可拖动并限制在 200–560px', outlineResize.min === 200 && outlineResize.max === 560 && outlineResize.mid === 300 && outlineResize.saved === '300' && outlineResize.cursor !== 'col-resize', JSON.stringify(outlineResize));

const commentButtonReuse = JSON.parse(await evaluate(`(() => {
  const store = window.__dafeiyu.store;
  const block = store.doc.blocks.find((item) => item.id === 'b3');
  const before = block.html;
  const button = document.querySelector('[data-id="b3"] .block-comment-btn');
  const group = document.querySelector('[data-id="b3"] .block-group-comment-btn');
  store.dispatch(() => [{ t: 'patchBlock', id: 'b3', patch: { html: before + 'x' } }]);
  const reused = document.querySelector('[data-id="b3"] .block-comment-btn') === button;
  const groupReused = document.querySelector('[data-id="b3"] .block-group-comment-btn') === group;
  store.dispatch(() => [{ t: 'patchBlock', id: 'b3', patch: { html: before } }]);
  return JSON.stringify({ reused, groupReused });
})()`));
check('区块重新渲染时注释按钮复用而非重建', commentButtonReuse.reused === true && commentButtonReuse.groupReused === true, JSON.stringify(commentButtonReuse));

const groupMark = JSON.parse(await evaluate(`(() => {
  const store = window.__dafeiyu.store;
  store.setSelection({ blockIds: ['b1', 'b2'], activeId: 'b2' });
  document.querySelector('#btn-mark').click();
  const note = store.doc.annotations.find((item) => item.type === 'mark' && item.anchor.blockIds?.length);
  const line = document.querySelectorAll('.block.has-group-mark').length === 2;
  const badges = document.querySelectorAll('[data-id="b1"] .block-badge, [data-id="b2"] .block-badge').length;
  const selection = store.selection.blockIds.length;
  const beforeCommentIds = new Set(store.doc.annotations.filter((item) => item.type === 'comment').map((item) => item.id));
  window.__dafeiyu.actions.comment('组标记注释', 'b1');
  const overlay = document.querySelector('.group-mark-line')?.getBoundingClientRect();
  const first = document.querySelector('[data-id="b1"]').getBoundingClientRect();
  const last = document.querySelector('[data-id="b2"]').getBoundingClientRect();
  const comment = Boolean(document.querySelector('.comment-display[data-block-id="b1"]'));
  const inset = Boolean(overlay)
    && overlay.top >= first.top + 2 && overlay.top <= first.top + 6
    && overlay.bottom <= last.bottom - 2 && overlay.bottom >= last.bottom - 6;
  store.setSelection({ blockIds: ['b1', 'b2'], activeId: 'b2' });
  window.__dafeiyu.actions.clearMark();
  const cleared = !store.doc.annotations.some((item) => item.type === 'mark' && item.anchor.blockIds?.length);
  const commentId = store.doc.annotations.find((item) => item.type === 'comment' && !beforeCommentIds.has(item.id))?.id;
  if (commentId) store.dispatch(() => [{ t: 'patchDoc', patch: { annotations: store.doc.annotations.filter((item) => item.id !== commentId) } }]);
  return JSON.stringify({ ids: note?.anchor.blockIds ?? null, line, badges, selection, comment, inset, cleared, lineGone: !document.querySelector('.block.has-group-mark, .group-mark-line') });
})()`));
check('组标记：一条实线并支持取消', groupMark.ids?.join(',') === 'b1,b2' && groupMark.line === true && groupMark.badges === 1 && groupMark.selection === 0 && groupMark.comment === true && groupMark.inset === true && groupMark.cleared === true && groupMark.lineGone === true, JSON.stringify(groupMark));

const colorPalettes = JSON.parse(await evaluate(`(() => {
  const mark = document.querySelector('#mark-palette');
  const comment = document.querySelector('#comment-palette');
  const button = mark?.querySelectorAll('.color-palette-swatch')[5];
  if (button) button.click();
  return JSON.stringify({
    markRows: mark?.querySelectorAll('.color-palette-row').length ?? 0,
    markSwatches: mark?.querySelectorAll('.color-palette-swatch').length ?? 0,
    commentRows: comment?.querySelectorAll('.color-palette-row').length ?? 0,
    commentSwatches: comment?.querySelectorAll('.color-palette-swatch').length ?? 0,
    picked: document.querySelector('#mark-color')?.value,
    active: mark?.querySelectorAll('.color-palette-swatch.is-active').length ?? 0,
    unique: new Set([...mark.querySelectorAll('.color-palette-swatch')].map((item) => item.dataset.color)).size,
  });
})()`));
check('标记/注释颜色面板：主题色 + 标准色', colorPalettes.markRows === 3 && colorPalettes.markSwatches === 21 && colorPalettes.commentRows === 3 && colorPalettes.commentSwatches === 21 && colorPalettes.picked === '#00ffff' && colorPalettes.active === 1 && colorPalettes.unique === 21, JSON.stringify(colorPalettes));

const customPalette = JSON.parse(await evaluate(`(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const button = document.querySelector('#mark-color-btn');
  const anchor = button.getBoundingClientRect();
  const beforeRows = document.querySelectorAll('#mark-palette .color-palette-row').length;
  button.click();
  await sleep(80);
  const picker = document.querySelector('#color-picker');
  const labels = [...picker.querySelectorAll('.cp-actions button')].map((item) => item.textContent.trim());
  const pickerLeft = picker.getBoundingClientRect().left;
  const hex = picker.querySelector('.cp-hex');
  const custom = '#' + Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0');
  hex.value = custom;
  hex.dispatchEvent(new Event('input', { bubbles: true }));
  picker.querySelector('.cp-add').click();
  await sleep(80);
  const addText = picker.querySelector('.cp-add').textContent.trim();
  picker.querySelector('.cp-cancel').click();
  await sleep(80);
  const palette = document.querySelector('#mark-palette');
  const afterRows = palette.querySelectorAll('.color-palette-row').length;
  const customSwatch = palette.querySelector('.color-palette-swatch[data-custom="1"]');
  customSwatch.click();
  const code = document.querySelector('#mark-color-code').value.trim();
  const divider = Boolean(palette.querySelector('.color-palette-divider'));
  const rect = customSwatch.getBoundingClientRect();
  customSwatch.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: rect.left + 4, clientY: rect.top + 4 }));
  await sleep(50);
  const menuLabels = [...document.querySelectorAll('.context-menu-item')].map((item) => item.textContent.trim());
  [...document.querySelectorAll('.context-menu-item')].find((item) => item.textContent.trim() === '删除')?.click();
  await sleep(80);
  return JSON.stringify({
    labels,
    shifted: pickerLeft > anchor.left,
    addText,
    beforeRows,
    afterRows,
    custom,
    code,
    divider,
    menuLabels,
    afterDeleteRows: document.querySelectorAll('#mark-palette .color-palette-row').length,
    afterDeleteDivider: Boolean(document.querySelector('#mark-palette .color-palette-divider')),
    panelVisible: !document.querySelector('#mark-panel').hidden,
    stored: localStorage.getItem('dafeiyu-next.custom-colors'),
  });
})()`));
check('选色器：确定/取消在左、加入色板在右，自定义色可右键删除', customPalette.labels.join(',') === '确定,取消,添加到色板' && customPalette.shifted === true && customPalette.addText === '已添加' && customPalette.afterRows === customPalette.beforeRows + 1 && customPalette.code === customPalette.custom.toUpperCase() && customPalette.divider === true && customPalette.menuLabels.join(',') === '复制色号,删除' && customPalette.afterDeleteRows === customPalette.beforeRows && customPalette.afterDeleteDivider === false && customPalette.panelVisible === true && customPalette.stored === '[]', JSON.stringify(customPalette));


const commentPanel = JSON.parse(await evaluate(`(() => {
  document.querySelector('#btn-comment-more').click();
  const anchor = document.querySelector('#btn-comment').getBoundingClientRect();
  const panel = document.querySelector('#comment-panel').getBoundingClientRect();
  const centered = Math.abs((panel.left + panel.right) / 2 - (anchor.left + anchor.right) / 2) < 2 || panel.left <= 8.5 || panel.right >= window.innerWidth - 8.5;
  const below = panel.top >= anchor.bottom;
  const code = document.querySelector('#comment-color-code');
  code.value = '#123456';
  code.dispatchEvent(new Event('input', { bubbles: true }));
  code.blur();
  const color = document.querySelector('#comment-color').value;
  const swatch = document.querySelector('#comment-color-btn').style.background;
  const labels = [...document.querySelectorAll('#comment-panel .comment-actions button')].map((item) => item.textContent.trim());
  const swatches = document.querySelectorAll('#comment-palette .color-palette-swatch').length;
  const iconColor = getComputedStyle(document.querySelector('#btn-comment .tb-ic')).color;
  document.querySelector('#btn-comment-cancel').click();
  return JSON.stringify({ color, swatch, labels, swatches, iconColor, centered, below });
})()`));
check('注释颜色面板同步色号、色板和删除/取消/应用', commentPanel.color === '#123456' && commentPanel.swatch === 'rgb(18, 52, 86)' && commentPanel.labels.join(',') === '删除注释,取消,应用' && commentPanel.swatches === 21 && commentPanel.iconColor === 'rgb(18, 52, 86)' && commentPanel.centered === true && commentPanel.below === true, JSON.stringify(commentPanel));


const commentOutsideSave = JSON.parse(await evaluate(`(() => {
  document.querySelector('#btn-comment-more').click();
  const code = document.querySelector('#comment-color-code');
  code.value = '#00bbcc';
  code.dispatchEvent(new Event('input', { bubbles: true }));
  code.blur();
  document.querySelector('#workspace').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 }));
  return JSON.stringify({
    saved: JSON.parse(localStorage.getItem('dafeiyu-next.note-appearance') || 'null'),
    panelHidden: document.querySelector('#comment-panel').hidden,
    iconColor: getComputedStyle(document.querySelector('#btn-comment .tb-ic')).color,
  });
})()`));
check('注释面板外点击保存颜色并更新图标', commentOutsideSave.saved?.color === '#00bbcc' && commentOutsideSave.panelHidden === true && commentOutsideSave.iconColor === 'rgb(0, 187, 204)', JSON.stringify(commentOutsideSave));


const colorOrder = JSON.parse(await evaluate(`(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const waitFor = async (fn, timeout = 1200) => {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      if (fn()) return true;
      await sleep(25);
    }
    return false;
  };
  document.querySelector('#mark-color-btn').click();
  await sleep(80);
  const picker = document.querySelector('#color-picker');
  const hex = picker.querySelector('.cp-hex');
  for (const color of ['#123456', '#654321']) {
    hex.value = color;
    hex.dispatchEvent(new Event('input', { bubbles: true }));
    picker.querySelector('.cp-add').click();
    await sleep(40);
  }
  picker.querySelector('.cp-cancel').click();
  await sleep(80);
  const palette = document.querySelector('#mark-palette');
  const custom = () => [...palette.querySelectorAll('[data-custom="1"]')];
  const orderBefore = custom().map((item) => item.dataset.color);
  const first = custom()[0];
  const second = custom()[1];
  const start = first.getBoundingClientRect();
  const rect = second.getBoundingClientRect();
  first.dispatchEvent(new PointerEvent('pointerdown', {
    bubbles: true, cancelable: true, pointerId: 1, button: 0,
    clientX: start.left + 4, clientY: start.top + 4,
  }));
  first.dispatchEvent(new PointerEvent('pointermove', {
    bubbles: true, cancelable: true, pointerId: 1, buttons: 1,
    clientX: rect.right - 1, clientY: rect.top + 4,
  }));
  const lineVisible = [...palette.querySelectorAll('.color-drop-line')].some((line) => !line.hidden);
  first.dispatchEvent(new PointerEvent('pointerup', {
    bubbles: true, cancelable: true, pointerId: 1, button: 0,
    clientX: rect.right - 1, clientY: rect.top + 4,
  }));
  await waitFor(() => custom()[0]?.dataset.color === '#654321');
  const orderAfter = custom().map((item) => item.dataset.color);
  for (let i = 0; i < 2; i += 1) {
    const button = custom()[0];
    if (!button) break;
    const before = custom().length;
    const box = button.getBoundingClientRect();
    button.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: box.left + 2, clientY: box.top + 2 }));
    await waitFor(() => Boolean(document.querySelector('.context-menu-item')));
    [...document.querySelectorAll('.context-menu-item')].find((item) => item.textContent.trim() === '删除')?.click();
    await waitFor(() => custom().length < before);
  }
  await waitFor(() => localStorage.getItem('dafeiyu-next.custom-colors') === '[]');
  return JSON.stringify({
    orderBefore,
    orderAfter,
    lineVisible,
    storedAfter: localStorage.getItem('dafeiyu-next.custom-colors'),
    panelVisible: !document.querySelector('#mark-panel').hidden,
  });
})()`));
check('自定义颜色可拖动排序', colorOrder.orderBefore.length === 2 && colorOrder.orderBefore[0] === '#123456' && colorOrder.orderAfter[0] === '#654321' && colorOrder.lineVisible === true && colorOrder.storedAfter === '[]' && colorOrder.panelVisible === true, JSON.stringify(colorOrder));


const colorCodeEdit = JSON.parse(await evaluate(`(() => {
  const code = document.querySelector('#mark-color-code');
  const color = document.querySelector('#mark-color');
  const swatch = document.querySelector('#mark-color-btn');
  code.click();
  const selected = code.selectionStart === 0 && code.selectionEnd === code.value.length;
  code.value = '#12ab34';
  code.dispatchEvent(new Event('input', { bubbles: true }));
  const live = color.value;
  const liveSwatch = swatch.style.background;
  code.dispatchEvent(new Event('change', { bubbles: true }));
  code.blur();
  return JSON.stringify({ selected, live, liveSwatch, code: code.value, color: color.value });
})()`));
check('色号可点击全选并输入改色', colorCodeEdit.selected === true && colorCodeEdit.live === '#12ab34' && colorCodeEdit.liveSwatch === 'rgb(18, 171, 52)' && colorCodeEdit.code === '#12AB34' && colorCodeEdit.color === '#12ab34', JSON.stringify(colorCodeEdit));


const markIconColor = JSON.parse(await evaluate(`(() => {
  const code = document.querySelector('#mark-color-code');
  code.value = '#3366cc';
  code.dispatchEvent(new Event('input', { bubbles: true }));
  code.blur();
  return JSON.stringify({
    input: document.querySelector('#mark-color').value,
    icon: getComputedStyle(document.querySelector('#btn-mark .tb-ic')).color,
  });
})()`));
check('工具栏标记图标跟随选中颜色', markIconColor.input === '#3366cc' && markIconColor.icon === 'rgb(51, 102, 204)', JSON.stringify(markIconColor));

const markUndo = JSON.parse(await evaluate(`(() => {
  const store = window.__dafeiyu.store;
  store.setSelection({ blockIds: ['b6'], activeId: 'b6' });
  window.__dafeiyu.actions.mark();
  const hasMark = () => store.doc.annotations.some((item) => item.type === 'mark' && item.anchor.blockId === 'b6');
  const on = hasMark();
  store.undo();
  const off = hasMark();
  return JSON.stringify({ on, off });
})()`));
check('标注可撤销', markUndo.on === true && markUndo.off === false, JSON.stringify(markUndo));

const plugin = JSON.parse(await evaluate(`(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  for (let i = 0; i < 25; i += 1) {
    if (document.querySelectorAll('#plugin-actions button').length) break;
    await sleep(120);
  }
  const commands = [...document.querySelectorAll('#plugin-actions button')].map((button) => button.textContent.trim());
  const before = window.__dafeiyu.store.doc.blocks.length;
  const dateButton = [...document.querySelectorAll('#plugin-actions button')].find((button) => button.textContent.includes('日期'));
  dateButton?.click();
  await sleep(350);
  const after = window.__dafeiyu.store.doc.blocks.length;
  const toast = document.querySelector('#toast')?.textContent?.trim() || '';
  return JSON.stringify({ commands, before, after, toast });
})()`));
check('插件命令加载与执行', plugin.commands.some((title) => title.includes('日期')) && plugin.after === plugin.before + 1, JSON.stringify(plugin));

const pluginBadge = JSON.parse(await evaluate(`(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const store = window.__dafeiyu.store;
  store.setSelection({ blockIds: ['b2'], activeId: 'b2' });
  window.__dafeiyu.actions.mark();
  window.__dafeiyu.actions.searchPanel();
  await sleep(80);
  const input = document.querySelector('#titlebar-search-input');
  input.value = '第二块';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await sleep(180);
  const badges = document.querySelectorAll('#search .slot-badge').length;
  const hits = document.querySelectorAll('#search .search-hit').length;
  document.querySelector('#btn-plugins').click();
  await sleep(120);
  const rows = document.querySelectorAll('#plugins .plugin-row').length;
  document.querySelector('#plugins [data-plugins-close]')?.click();
  return JSON.stringify({ badges, hits, rows });
})()`));
check('搜索不再显示示例插件徽章 / 管理面板列出插件', pluginBadge.badges === 0 && pluginBadge.hits >= 1 && pluginBadge.rows >= 1, JSON.stringify(pluginBadge));

const clipboard = JSON.parse(await evaluate(`(async () => {
  const store = window.__dafeiyu.store;
  const actions = window.__dafeiyu.actions;
  store.setSelection({ blockIds: ['b1', 'b2'], activeId: 'b2' });
  const before = store.doc.blocks.length;
  await actions.copy();
  await actions.paste();
  const afterPaste = store.doc.blocks.length;
  const pastedSelection = store.selection.blockIds.length;
  store.undo();
  return JSON.stringify({ before, afterPaste, pastedSelection, afterUndo: store.doc.blocks.length, selectionAfterUndo: store.selection.blockIds.length });
})()`));
check('复制→粘贴→撤销后选区恢复（R3/R5）', clipboard.afterPaste === clipboard.before + 2 && clipboard.pastedSelection === 2 && clipboard.afterUndo === clipboard.before && clipboard.selectionAfterUndo === 2, JSON.stringify(clipboard));

const tocTail = JSON.parse(await evaluate(`(() => {
  const store = window.__dafeiyu.store;
  const items = [...document.querySelectorAll('.toc-item')];
  if (items.length < 2) return JSON.stringify({ skipped: true });
  const draggedId = items[0].dataset.tocId;
  const handle = items[0].querySelector('.toc-handle');
  const tail = document.querySelector('[data-toc-tail]');
  const from = handle.getBoundingClientRect();
  const to = tail.getBoundingClientRect();
  const opts = { bubbles: true, cancelable: true, button: 0, buttons: 1, pointerId: 91, isPrimary: true, pointerType: 'mouse' };
  handle.dispatchEvent(new PointerEvent('pointerdown', { ...opts, clientX: from.left + 4, clientY: from.top + 4 }));
  tail.dispatchEvent(new PointerEvent('pointermove', { ...opts, clientX: to.left + 20, clientY: to.top + 6 }));
  tail.dispatchEvent(new PointerEvent('pointerup', { ...opts, buttons: 0, clientX: to.left + 20, clientY: to.top + 6 }));
  const last = store.doc.toc[store.doc.toc.length - 1];
  return JSON.stringify({ isLast: last?.id === draggedId, total: store.doc.toc.length, tailVisible: Boolean(tail) });
})()`));
check('拖到目录末尾有插入区并成为末项（R7）', tocTail.tailVisible === true && tocTail.isLast === true, JSON.stringify(tocTail));

const ime = JSON.parse(await evaluate(`(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const store = window.__dafeiyu.store;
  const block = store.doc.blocks.find((item) => item.id === 'b3');
  const content = document.querySelector('[data-id="b3"] .block-content');
  const original = content.innerHTML;
  content.focus();
  content.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
  content.innerHTML = '组合中的文字';
  content.dispatchEvent(new InputEvent('input', { bubbles: true, isComposing: true }));
  await sleep(450);
  const during = store.doc.blocks.find((item) => item.id === 'b3').html;
  content.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '组合中的文字' }));
  await sleep(500);
  const after = store.doc.blocks.find((item) => item.id === 'b3').html;
  content.innerHTML = original;
  store.dispatch(() => [{ t: 'patchBlock', id: 'b3', patch: { html: original } }]);
  content.blur();
  return JSON.stringify({ during, after, original });
})()`));
check('输入法组合期间不写模型（R19）', ime.during === ime.original && ime.after.includes('组合中的文字'), JSON.stringify(ime));

const outlineDrop = JSON.parse(await evaluate(`(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const store = window.__dafeiyu.store;
  const before = store.doc.toc.length;
  const handle = document.querySelector('[data-id="b6"] .block-handle');
  const outline = document.querySelector('#outline');
  const from = handle.getBoundingClientRect();
  const to = outline.getBoundingClientRect();
  const opts = { bubbles: true, cancelable: true, button: 0, buttons: 1, pointerId: 77, isPrimary: true, pointerType: 'mouse' };
  handle.dispatchEvent(new PointerEvent('pointerdown', { ...opts, clientX: from.left + 4, clientY: from.top + 4 }));
  document.dispatchEvent(new PointerEvent('pointermove', { ...opts, clientX: to.left + 40, clientY: to.top + 60 }));
  await sleep(60);
  document.dispatchEvent(new PointerEvent('pointerup', { ...opts, buttons: 0, clientX: to.left + 40, clientY: to.top + 60 }));
  await sleep(200);
  const entry = store.doc.toc.find((item) => item.blockId === 'b6' || item.blockIds.includes('b6'));
  return JSON.stringify({ before, after: store.doc.toc.length, addedBlock: entry ? 'b6' : null, depth: entry?.parentId ?? null });
})()`));
check('把块拖到目录即可加入（R11）', outlineDrop.after === outlineDrop.before + 1 && outlineDrop.addedBlock === 'b6', JSON.stringify(outlineDrop));

const marqueeFixed = JSON.parse(await evaluate(`(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const paper = document.querySelector('#blocks');
  const ws = document.querySelector('#workspace');
  const rect = paper.getBoundingClientRect();
  const opts = { bubbles: true, cancelable: true, button: 0, buttons: 1, pointerId: 66, isPrimary: true, pointerType: 'mouse' };
  const blankY = rect.bottom - 8;
  paper.dispatchEvent(new PointerEvent('pointerdown', { ...opts, clientX: rect.left + 12, clientY: blankY }));
  await sleep(100);
  const box = document.querySelector('.marquee');
  const topBefore = box?.style.top;
  ws.scrollTop += 120;
  await sleep(80);
  document.dispatchEvent(new PointerEvent('pointermove', { ...opts, clientX: rect.left + 12, clientY: blankY }));
  const topAfter = document.querySelector('.marquee')?.style.top;
  document.dispatchEvent(new PointerEvent('pointerup', { ...opts, buttons: 0, clientX: rect.left + 12, clientY: blankY }));
  return JSON.stringify({ topBefore, topAfter, anchored: topBefore === topAfter });
})()`));
check('框选起点固定在页面坐标，滚动不漂移（R1）', marqueeFixed.anchored === true, JSON.stringify(marqueeFixed));

const clickScroll = JSON.parse(await evaluate(`(() => {
  const ws = document.querySelector('#workspace');
  const before = ws.scrollTop;
  document.querySelector('[data-id="b4"] .block-content')?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  document.querySelector('[data-id="b4"] .block-content')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  return JSON.stringify({ before, after: ws.scrollTop, unchanged: before === ws.scrollTop });
})()`));
check('点击块不改变滚动位置（R12）', clickScroll.unchanged === true, JSON.stringify(clickScroll));

const defaultSelect = JSON.parse(await evaluate(`JSON.stringify({ select: getComputedStyle(document.documentElement).getPropertyValue('--select').trim() })`));
check('默认框选高亮为中性灰（R18）', defaultSelect.select.toLowerCase() === '#e8e8e8', JSON.stringify(defaultSelect));

const pluginDelete = JSON.parse(await evaluate(`(async () => {
  const before = (await window.moye.plugins.list()).map((plugin) => plugin.id);
  const result = await window.moye.plugins.remove('user-extra');
  const after = (await window.moye.plugins.list()).map((plugin) => plugin.id);
  return JSON.stringify({ before, after, result });
})()`));
check('删除用户插件后不会被重建（R16）', pluginDelete.before.includes('user-extra') && !pluginDelete.after.includes('user-extra') && pluginDelete.result?.ok === true, JSON.stringify(pluginDelete));

const blockOps = JSON.parse(await evaluate(`(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  await sleep(500);
  const store = window.__dafeiyu.store;
  const actions = window.__dafeiyu.actions;
  const order = () => store.doc.blocks.map((block) => block.id).join(',');
  store.setSelection({ blockIds: ['b2'], activeId: 'b2' });
  const before = order();
  actions.move(1);
  const movedOk = order() !== before;
  store.undo();
  const moveUndoOk = order() === before;
  const beforeDup = order();
  actions.duplicate();
  const dupAdded = store.doc.blocks.length;
  store.undo();
  const dupUndoOk = order() === beforeDup;
  return JSON.stringify({ movedOk, moveUndoOk, dupAdded, dupUndoOk });
})()`));
check('块上移/下移、复制这段、撤销（R5）', blockOps.movedOk && blockOps.moveUndoOk && blockOps.dupUndoOk && blockOps.dupAdded >= 8, JSON.stringify(blockOps));

const linkCheck = JSON.parse(await evaluate(`(() => {
  const store = window.__dafeiyu.store;
  const content = document.querySelector('[data-id="b1"] .block-content');
  content.focus();
  const range = document.createRange();
  range.selectNodeContents(content);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
  document.querySelector('#btn-link').click();
  const input = document.querySelector('#link-input');
  input.value = 'https://example.com';
  document.querySelector('#btn-link-apply').click();
  const html = store.doc.blocks.find((block) => block.id === 'b1').html;
  return JSON.stringify({ hasLink: html.includes('<a href="https://example.com"') });
})()`));
check('插入链接（Ctrl+点击可打开）', linkCheck.hasLink, JSON.stringify(linkCheck));

const view = JSON.parse(await evaluate(`(() => {
  const actions = window.__dafeiyu.actions;
  actions.zoom(1.5);
  const zoomed = document.querySelector('#blocks').style.zoom;
  actions.zoom(1);
  actions.setPageSize('B5');
  const pageStored = localStorage.getItem('dafeiyu-next.page-size');
  actions.palette({ bg: '#eeeeee', paper: '#ffffff', ink: '#111111', select: '#dddddd' });
  const selectVar = getComputedStyle(document.documentElement).getPropertyValue('--select').trim();
  return JSON.stringify({ zoomed, pageStored, selectVar });
})()`));
check('缩放 / 页面尺寸 / 调色板', view.zoomed === '1.5' && view.pageStored === 'B5' && view.selectVar === '#dddddd', JSON.stringify(view));

const tableCheck = JSON.parse(await evaluate(`(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const store = window.__dafeiyu.store;
  const actions = window.__dafeiyu.actions;
  store.setSelection({ blockIds: ['b4'], activeId: 'b4' });
  const before = store.doc.blocks.find((block) => block.id === 'b4').meta.rows.map((row) => row.length);
  actions.tableRowAdd();
  const afterRow = store.doc.blocks.find((block) => block.id === 'b4').meta.rows;
  actions.tableColAdd();
  const afterCol = store.doc.blocks.find((block) => block.id === 'b4').meta.rows;
  const cell = document.querySelector('[data-id="b4"] td[data-row="0"][data-column="0"], [data-id="b4"] th[data-row="0"][data-column="0"]');
  if (cell) {
    cell.textContent = '洛斯里克';
    cell.dispatchEvent(new InputEvent('input', { bubbles: true }));
  }
  await sleep(600);
  const rows = store.doc.blocks.find((block) => block.id === 'b4').meta.rows;
  return JSON.stringify({ beforeRows: before.length, afterRows: afterRow.length, beforeCols: before[0], afterCols: afterCol[0].length, cell: rows[0][0] });
})()`));
check('表格增删行列与单元格编辑', tableCheck.afterRows === tableCheck.beforeRows + 1 && tableCheck.afterCols === tableCheck.beforeCols + 1 && tableCheck.cell === '洛斯里克', JSON.stringify(tableCheck));

const imageCheck = JSON.parse(await evaluate(`(async () => {
  const store = window.__dafeiyu.store;
  store.setSelection({ blockIds: ['b6'], activeId: 'b6' });
  const before = store.doc.blocks.length;
  await window.__dafeiyu.actions.insertImage();
  const added = store.doc.blocks.find((block) => block.id === store.selection.activeId);
  window.__dafeiyu.actions.imageWidth(-10);
  const width = store.doc.blocks.find((block) => block.id === added?.id)?.meta?.width;
  return JSON.stringify({ before, after: store.doc.blocks.length, type: added?.type, src: String(added?.meta?.src || '').slice(0, 16), width });
})()`));
check('插入图片 / 宽度调整', imageCheck.after === imageCheck.before + 1 && imageCheck.type === 'image' && imageCheck.src.startsWith('data:image') && imageCheck.width === 90, JSON.stringify(imageCheck));

const imageEdit = JSON.parse(await evaluate(`(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const store = window.__dafeiyu.store;
  const id = store.doc.blocks.filter((block) => block.type === 'image').slice(-1)[0].id;
  const el = document.querySelector('[data-id="' + id + '"]');
  const rect = el.getBoundingClientRect();
  const open = () => el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: rect.left + 20, clientY: rect.top + 20 }));
  const pick = (label) => {
    const button = [...document.querySelectorAll('.context-menu-item')].find((item) => item.textContent.trim() === label);
    button?.click();
  };
  const src = () => store.doc.blocks.find((block) => block.id === id)?.meta?.src ?? '';
  open();
  const hasMenu = Boolean(document.querySelector('.context-menu'));
  pick('居中');
  const align = store.doc.blocks.find((block) => block.id === id)?.align;
  const before = src();
  open();
  pick('水平翻转');
  await sleep(400);
  const flipped = src() !== before;
  open();
  pick('裁剪…');
  await sleep(200);
  const hasCrop = Boolean(document.querySelector('.crop-overlay'));
  document.querySelector('.crop-toolbar .primary')?.click();
  await sleep(500);
  const cropped = src() !== before;
  return JSON.stringify({ hasMenu, align, flipped, hasCrop, cropped });
})()`));
check('图片右键：对齐 / 翻转 / 剪裁', imageEdit.hasMenu === true && imageEdit.align === 'center' && imageEdit.flipped === true && imageEdit.hasCrop === true && imageEdit.cropped === true, JSON.stringify(imageEdit));

const chrome = JSON.parse(await evaluate(`(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const maximize = document.querySelector('#win-max');
  const before = await window.moye.info();
  maximize.click();
  await sleep(500);
  const maximized = await window.moye.info();
  maximize.click();
  await sleep(500);
  const restored = await window.moye.info();
  const buttons = ['win-min', 'win-max', 'win-close'].every((id) => Boolean(document.querySelector('#' + id)));
  const dt = new DataTransfer();
  dt.items.add(new File(['{}'], 'x.dfy', { type: 'application/json' }));
  window.dispatchEvent(new DragEvent('dragenter', { dataTransfer: dt, bubbles: true }));
  const hintShown = Boolean(document.querySelector('.drop-hint'));
  window.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
  const hintHidden = !document.querySelector('.drop-hint');
  return JSON.stringify({ buttons, before: before.maximized, maximized: maximized.maximized, restored: restored.maximized, hintShown, hintHidden });
})()`));
check('自绘标题栏 / 拖入文件提示', chrome.buttons === true && chrome.before === false && chrome.maximized === true && chrome.restored === false && chrome.hintShown === true && chrome.hintHidden === true, JSON.stringify(chrome));

const noteImage = JSON.parse(await evaluate(`(async () => {
  const store = window.__dafeiyu.store;
  store.setSelection({ blockIds: ['b6'], activeId: 'b6' });
  const ok = await window.__dafeiyu.actions.commentImage('b6');
  const note = store.doc.annotations.filter((item) => item.type === 'comment' && item.anchor.blockId === 'b6').slice(-1)[0];
  window.__dafeiyu.actions.openNotes('b6');
  document.querySelector('.comment-inline-actions [data-note-close]')?.click();
  const images = document.querySelectorAll('.comment-display[data-block-id="b6"] .comment-line-image').length;
  return JSON.stringify({ ok, images: note?.images?.length ?? 0, rendered: images });
})()`));
check('批注图片', noteImage.ok === true && noteImage.images === 1 && noteImage.rendered === 1, JSON.stringify(noteImage));

const markStyle = JSON.parse(await evaluate(`(async () => {
  const store = window.__dafeiyu.store;
  const actions = window.__dafeiyu.actions;
  store.setSelection({ blockIds: ['b3'], activeId: 'b3' });
  actions.mark();
  await actions.markImage();
  const mark = store.doc.annotations.find((item) => item.type === 'mark' && item.anchor.blockId === 'b3')?.mark;
  const badgeImage = document.querySelectorAll('[data-id="b3"] .block-badge-image').length;
  return JSON.stringify({ image: String(mark?.image || '').slice(0, 16), badgeImage });
})()`));
check('标注图片', markStyle.image.startsWith('data:image') && markStyle.badgeImage === 1, JSON.stringify(markStyle));

const appearance = JSON.parse(await evaluate(`(() => {
  const store = window.__dafeiyu.store;
  store.setSelection({ blockIds: ['b3'], activeId: 'b3' });
  window.__dafeiyu.actions.openNotes('b3');
  const input = document.querySelector('.comment-line.is-editing .comment-line-text');
  const labels = [...document.querySelectorAll('.comment-inline-actions button')].filter((button) => !button.hidden).map((button) => button.textContent.trim());
  input.innerText = '通过确定按钮添加的注释';
  document.querySelector('.comment-inline-actions [data-note-add]').click();
  const note = store.doc.annotations.filter((item) => item.type === 'comment' && item.anchor.blockId === 'b3').slice(-1)[0];
  const display = document.querySelector('.comment-display[data-block-id="b3"] .comment-line-text')?.textContent;
  const selectionCleared = store.selection.blockIds.length === 0 && store.selection.activeId === null;
  return JSON.stringify({ html: note?.html, labels, display, selectionCleared });
})()`));
check('注释编辑器：插入内容 / 删除注释 / 关闭 / 确定，提交后收起', appearance.html === '通过确定按钮添加的注释' && appearance.labels.join(',') === '插入内容,删除注释,关闭,确定' && appearance.display === '通过确定按钮添加的注释' && appearance.selectionCleared === true, JSON.stringify(appearance));


const commentRecolor = JSON.parse(await evaluate(`(() => {
  const store = window.__dafeiyu.store;
  store.setSelection({ blockIds: ['b3'], activeId: 'b3' });
  document.querySelector('#btn-comment-more').click();
  const code = document.querySelector('#comment-color-code');
  code.value = '#abc123';
  code.dispatchEvent(new Event('input', { bubbles: true }));
  code.blur();
  document.querySelector('#btn-comment-apply').click();
  const note = store.doc.annotations.filter((item) => item.type === 'comment' && item.anchor.blockId === 'b3').slice(-1)[0];
  return JSON.stringify({
    color: note?.color,
    lineColor: getComputedStyle(document.querySelector('.comment-display[data-block-id="b3"] .comment-line')).getPropertyValue('--comment-color').trim(),
  });
})()`));
check('注释应用颜色后更新已有注释', commentRecolor.color === '#abc123' && commentRecolor.lineColor === '#abc123', JSON.stringify(commentRecolor));


const commentUndoDraft = JSON.parse(await evaluate(`(() => {
  const store = window.__dafeiyu.store;
  store.setSelection({ blockIds: ['b3'], activeId: 'b3' });
  document.querySelector('#btn-comment').click();
  const text = document.querySelector('.comment-line.is-editing .comment-line-text');
  const before = JSON.stringify(store.doc.annotations);
  text.focus();
  text.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true, cancelable: true }));
  return JSON.stringify({
    draftStillOpen: Boolean(document.querySelector('.comment-line.is-editing')),
    stateSame: before === JSON.stringify(store.doc.annotations),
  });
})()`));
check('注释草稿内 Ctrl+Z 无反应，不撤销文档', commentUndoDraft.draftStillOpen === true && commentUndoDraft.stateSame === true, JSON.stringify(commentUndoDraft));

const markEdit = JSON.parse(await evaluate(`(() => {
  const store = window.__dafeiyu.store;
  store.setSelection({ blockIds: ['b3'], activeId: 'b3' });
  document.querySelector('#btn-mark-more').click();
  const iconChoices = document.querySelectorAll('#mark-icon-grid [data-icon-value]').length;
  document.querySelector('[data-icon-value="▲"]').click();
  document.querySelector('#mark-color').value = '#c00000';
  document.querySelector('#btn-mark-apply').click();
  const mark = store.doc.annotations.find((item) => item.type === 'mark' && item.anchor.blockId === 'b3')?.mark;
  const glyph = document.querySelector('[data-id="b3"] .block-badge-shape')?.textContent;
  const badgeColor = getComputedStyle(document.querySelector('[data-id="b3"] .block-badge')).color;
  const appearance = JSON.parse(localStorage.getItem('dafeiyu-next.mark-appearance') || 'null');
  return JSON.stringify({ iconChoices, iconValue: document.querySelector('#mark-icon').value, toolbarGlyph: document.querySelector('#btn-mark .tb-ic').textContent.trim(), icon: mark?.icon, color: mark?.color, label: mark?.label, glyph, badgeColor, appearance });
})()`));
check('标记图标 / 颜色', markEdit.iconChoices === 15 && markEdit.iconValue === '▲' && markEdit.toolbarGlyph === '▲' && markEdit.icon === '▲' && markEdit.color === '#c00000' && markEdit.label === '标记' && markEdit.glyph === '▲' && markEdit.badgeColor === 'rgb(192, 0, 0)' && markEdit.appearance?.color === '#c00000' && markEdit.appearance?.icon === '▲', JSON.stringify(markEdit));


const markDelete = JSON.parse(await evaluate(`(() => {
  const store = window.__dafeiyu.store;
  store.setSelection({ blockIds: ['b3'], activeId: 'b3' });
  document.querySelector('#btn-mark-more').click();
  const anchor = document.querySelector('#btn-mark').getBoundingClientRect();
  const panel = document.querySelector('#mark-panel').getBoundingClientRect();
  const centered = Math.abs((panel.left + panel.right) / 2 - (anchor.left + anchor.right) / 2) < 2 || panel.left <= 8.5 || panel.right >= window.innerWidth - 8.5;
  const below = panel.top >= anchor.bottom;
  const labels = [...document.querySelectorAll('#mark-panel .mark-panel-actions button')].map((item) => item.textContent.trim());
  document.querySelector('#btn-mark-delete').click();
  return JSON.stringify({
    labels,
    centered,
    below,
    hasMark: store.doc.annotations.some((item) => item.type === 'mark' && item.anchor.blockId === 'b3'),
    panelHidden: document.querySelector('#mark-panel').hidden,
  });
})()`));
check('标记面板：删除标记在左，取消/应用互换', markDelete.labels.join(',') === '删除标记,取消,应用' && markDelete.centered === true && markDelete.below === true && markDelete.hasMark === false && markDelete.panelHidden === true, JSON.stringify(markDelete));


const outsideSave = JSON.parse(await evaluate(`(() => {
  const store = window.__dafeiyu.store;
  store.setSelection({ blockIds: ['b1'], activeId: 'b1' });
  document.querySelector('#btn-mark-more').click();
  const code = document.querySelector('#mark-color-code');
  code.value = '#00aa88';
  code.dispatchEvent(new Event('input', { bubbles: true }));
  code.blur();
  document.querySelector('[data-icon-value="?"]').click();
  document.querySelector('#workspace').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 }));
  const saved = JSON.parse(localStorage.getItem('dafeiyu-next.mark-appearance') || 'null');
  const panelHidden = document.querySelector('#mark-panel').hidden;
  document.querySelector('#mark-icon').value = '!';
  store.setSelection({ blockIds: ['b4'], activeId: 'b4' });
  document.querySelector('#btn-mark').click();
  const mark = store.doc.annotations.find((item) => item.type === 'mark' && item.anchor.blockId === 'b4')?.mark;
  store.undo();
  return JSON.stringify({
    saved,
    panelHidden,
    quickIcon: mark?.icon,
    quickColor: mark?.color,
  });
})()`));
check('面板外点击保存外观，快捷标记使用完整保存值', outsideSave.panelHidden === true && outsideSave.saved?.color === '#00aa88' && outsideSave.saved?.icon === '?' && outsideSave.quickIcon === '?' && outsideSave.quickColor === '#00aa88', JSON.stringify(outsideSave));


const customIcon = JSON.parse(await evaluate(`(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const store = window.__dafeiyu.store;
  store.setSelection({ blockIds: ['b3'], activeId: 'b3' });
  document.querySelector('#btn-mark-more').click();
  document.querySelector('#mark-icon-add-btn').click();
  const input = document.querySelector('#mark-icon-add-input');
  input.value = '🐟';
  document.querySelector('#mark-icon-add-confirm').click();
  await sleep(50);
  const customButton = document.querySelector('#mark-icon-grid [data-custom="1"]');
  const stored = JSON.parse(localStorage.getItem('dafeiyu-next.icon-layout') || '[]').map((item) => item.value);
  const rect = customButton.getBoundingClientRect();
  customButton.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: rect.left + 3, clientY: rect.top + 3 }));
  await sleep(50);
  const menu = document.querySelector('.context-menu');
  const menuCompact = menu.classList.contains('is-compact');
  const menuWidth = menu.getBoundingClientRect().width;
  const menuLabels = [...document.querySelectorAll('.context-menu-item')].map((item) => item.textContent.trim());
  [...document.querySelectorAll('.context-menu-item')].find((item) => item.textContent.trim() === '删除')?.click();
  await sleep(50);
  return JSON.stringify({
    selected: document.querySelector('#mark-icon').value,
    customCount: document.querySelectorAll('#mark-icon-grid [data-custom="1"]').length,
    stored,
    menuLabels,
    menuCompact,
    menuWidth,
    afterDelete: JSON.parse(localStorage.getItem('dafeiyu-next.icon-layout') || '[]').map((item) => item.value),
    panelVisible: !document.querySelector('#mark-panel').hidden,
  });
})()`));
check('自定义图标：添加、右键删除、面板保持', customIcon.selected === 'star' && customIcon.customCount === 0 && customIcon.stored.includes('🐟') && customIcon.menuLabels.join(',') === '删除' && customIcon.menuCompact === true && customIcon.menuWidth >= 120 && customIcon.menuWidth <= 140 && !customIcon.afterDelete.includes('🐟') && customIcon.panelVisible === true, JSON.stringify(customIcon));


const iconLayout = JSON.parse(await evaluate(`(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const grid = document.querySelector('#mark-icon-grid');
  const before = [...grid.querySelectorAll('[data-icon-value]')].map((item) => item.dataset.iconValue);
  const source = grid.querySelector('[data-icon-value="?"]');
  const target = grid.querySelector('[data-icon-value="star"]');
  const dt = new DataTransfer();
  source.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt }));
  const rect = target.getBoundingClientRect();
  target.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt, clientX: rect.left + 1, clientY: rect.top + 4 }));
  const indicator = target.classList.contains('is-drop-before') || target.classList.contains('is-drop-after');
  target.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt, clientX: rect.left + 1, clientY: rect.top + 4 }));
  await sleep(50);
  const afterDrag = [...document.querySelectorAll('#mark-icon-grid [data-icon-value]')].map((item) => item.dataset.iconValue);
  const removeButton = document.querySelector('#mark-icon-grid [data-icon-value="!"]');
  const removeRect = removeButton.getBoundingClientRect();
  removeButton.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: removeRect.left + 3, clientY: removeRect.top + 3 }));
  await sleep(120);
  const menuLabels = [...document.querySelectorAll('.context-menu-item')].map((item) => item.textContent.trim());
  [...document.querySelectorAll('.context-menu-item')].find((item) => item.textContent.trim() === '删除')?.click();
  await sleep(120);
  const afterDelete = [...document.querySelectorAll('#mark-icon-grid [data-icon-value]')].map((item) => item.dataset.iconValue);
  const star = document.querySelector('#mark-icon-grid [data-icon-value="star"]');
  const starRect = star.getBoundingClientRect();
  star.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: starRect.left + 3, clientY: starRect.top + 3 }));
  await sleep(80);
  const lockedItem = document.querySelector('.context-menu-item');
  const starLocked = lockedItem?.textContent.trim() === '星标不可删除' && lockedItem.hasAttribute('disabled');
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await sleep(40);
  return JSON.stringify({
    before,
    afterDrag,
    indicator,
    afterDelete,
    menuLabels,
    starLocked,
    afterStarDelete: [...document.querySelectorAll('#mark-icon-grid [data-icon-value]')].map((item) => item.dataset.iconValue),
    stored: JSON.parse(localStorage.getItem('dafeiyu-next.icon-layout') || '[]').map((item) => item.value),
    panelVisible: !document.querySelector('#mark-panel').hidden,
  });
})()`));
check('系统图标可拖动排序、可删除', iconLayout.before.join(',') === 'star,▲,!,?,●,※,♦,⊙,◇,☀,❤,✿,♚,♠,■' && iconLayout.indicator === true && iconLayout.afterDrag[0] === '?' && iconLayout.afterDrag.indexOf('!') > 0 && iconLayout.afterDelete.length === 14 && iconLayout.menuLabels.join(',') === '删除' && iconLayout.starLocked === true && iconLayout.afterStarDelete.length === iconLayout.afterDelete.length && iconLayout.afterStarDelete.includes('star') && !iconLayout.afterDelete.includes('!') && iconLayout.stored.join(',') === iconLayout.afterDelete.join(',') && iconLayout.panelVisible === true, JSON.stringify(iconLayout));


const iconLimit = JSON.parse(await evaluate(`(() => {
  const key = 'dafeiyu-next.icon-layout';
  const base = JSON.parse(localStorage.getItem(key) || '[]');
  const customs = Array.from({ length: 85 }, (_, index) => ({
    value: 'cap-' + index,
    glyph: String.fromCodePoint(0x4e00 + index),
    label: '容量测试',
    custom: true,
  }));
  localStorage.setItem(key, JSON.stringify([...base, ...customs]));
  const panel = document.querySelector('#mark-panel');
  if (!panel.hidden) document.querySelector('#btn-mark-more').click();
  document.querySelector('#btn-mark-more').click();
  document.querySelector('#mark-icon-add-btn').click();
  const input = document.querySelector('#mark-icon-add-input');
  input.value = '上限测试';
  document.querySelector('#mark-icon-add-confirm').click();
  const toast = document.querySelector('#toast');
  const layout = JSON.parse(localStorage.getItem(key) || '[]');
  const message = toast.textContent || '';
  const shown = !toast.hidden && message.includes('上限');
  const customCount = layout.filter((item) => item.custom).length;
  const rejected = !layout.some((item) => item.glyph === '上限测试');
  document.querySelector('#mark-icon-add-form').hidden = true;
  panel.hidden = true;
  toast.hidden = true;
  localStorage.setItem(key, JSON.stringify(base));
  return JSON.stringify({ shown, customCount, rejected });
})()`));
check('自定义图标达到 85 个时提示上限', iconLimit.shown && iconLimit.customCount === 85 && iconLimit.rejected, JSON.stringify(iconLimit));


const markAppearance = JSON.parse(await evaluate(`(() => {
  const store = window.__dafeiyu.store;
  const key = 'dafeiyu-next.mark-appearance';
  const before = localStorage.getItem(key);
  store.setSelection({ blockIds: [], activeId: null });
  document.activeElement?.blur();
  document.querySelector('#btn-mark-more').click();
  document.querySelector('#mark-icon').value = '●';
  document.querySelector('#mark-color').value = '#123456';
  document.querySelector('#btn-mark-apply').click();
  const closed = document.querySelector('#mark-panel').hidden;
  const stored = JSON.parse(localStorage.getItem(key) || 'null');
  document.querySelector('#btn-mark-more').click();
  const icon = document.querySelector('#mark-icon').value;
  const color = document.querySelector('#mark-color').value;
  const toolbarGlyph = document.querySelector('#btn-mark .tb-ic').textContent.trim();
  document.querySelector('#btn-mark-more').click();
  if (before === null) localStorage.removeItem(key);
  else localStorage.setItem(key, before);
  return JSON.stringify({ closed, stored, icon, color, toolbarGlyph });
})()`));
check('无区块应用标记时保存当前外观', markAppearance.closed && markAppearance.stored?.icon === '●' && markAppearance.stored?.color === '#123456' && markAppearance.icon === '●' && markAppearance.color === '#123456' && markAppearance.toolbarGlyph === '●', JSON.stringify(markAppearance));

const typography = JSON.parse(await evaluate(`(() => {
  const store = window.__dafeiyu.store;
  const content = document.querySelector('[data-id="b1"] .block-content');
  content.focus();
  const range = document.createRange();
  range.selectNodeContents(content);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
  document.querySelector('#btn-strike').click();
  const strikeHtml = store.doc.blocks.find((block) => block.id === 'b1')?.html || '';

  store.setSelection({ blockIds: ['b2'], activeId: 'b2' });
  document.querySelector('#btn-right').click();
  const align = store.doc.blocks.find((block) => block.id === 'b2')?.align;

  window.getSelection()?.removeAllRanges();
  const font = document.querySelector('#font-family');
  const fontOptions = [...font.options].map((option) => option.textContent);
  font.value = 'MiSans';
  font.dispatchEvent(new Event('change', { bubbles: true }));
  document.querySelector('#font-size-menu').click();
  const sizeMenu = document.querySelector('.size-popover');
  const presetCount = sizeMenu?.querySelectorAll('.size-preset').length ?? 0;
  sizeMenu?.querySelector('[data-size="20"]')?.click();
  const menuSize = store.doc.blocks.find((item) => item.id === 'b2')?.fontSize;
  const size = document.querySelector('#font-size-input');
  size.value = '18';
  size.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  const block = store.doc.blocks.find((item) => item.id === 'b2');
  const fontFamilyComputed = getComputedStyle(document.querySelector('[data-id="b2"]')).fontFamily;

  const saveSeparator = document.querySelector('#btn-save').nextElementSibling?.classList.contains('tb-sep') === true
    && document.querySelector('#btn-save').nextElementSibling?.nextElementSibling?.id === 'btn-outline';
  document.querySelector('#btn-outline').click();
  const hidden = document.body.classList.contains('outline-hidden');
  const hiddenDisplay = getComputedStyle(document.querySelector('#outline')).display;
  const hiddenWorkspaceWidth = document.querySelector('.workspace').getBoundingClientRect().width;
  document.querySelector('#btn-outline').click();
  const shown = !document.body.classList.contains('outline-hidden');
  const shownDisplay = getComputedStyle(document.querySelector('#outline')).display;
  const shownWorkspaceWidth = document.querySelector('.workspace').getBoundingClientRect().width;
  return JSON.stringify({ strike: /<(s|strike)[\\s>]/.test(strikeHtml), align, fontFamily: block?.fontFamily, fontFamilyComputed, fontOptions, fontSize: block?.fontSize, presetCount, menuSize, hidden, shown, hiddenDisplay, shownDisplay, hiddenWorkspaceWidth, shownWorkspaceWidth, saveSeparator });
})()`));
check('删除线 / 右对齐 / 字体字号 / 侧栏显隐', typography.strike === true && typography.align === 'right' && typography.fontFamily === 'MiSans' && typography.fontFamilyComputed.includes('MiSans') && typography.fontOptions.slice(0, 3).join('|') === '思源黑体|霞鹜文楷|MiSans' && typography.presetCount === 28 && typography.menuSize === 20 && typography.fontSize === 18 && typography.hidden === true && typography.shown === true && typography.hiddenDisplay === 'none' && typography.shownDisplay !== 'none' && typography.hiddenWorkspaceWidth > 500 && typography.shownWorkspaceWidth > 500 && typography.saveSeparator === true, JSON.stringify(typography));


const altSelect = JSON.parse(await evaluate(`(() => {
  const store = window.__dafeiyu.store;
  store.dispatch(() => [{ t: 'patchDoc', patch: { groups: [{ id: 'g_test', blockIds: ['b2', 'b3'] }] } }]);
  store.setSelection({ blockIds: [], activeId: null });
  const content = document.querySelector('[data-id="b2"] .block-content');
  const rect = content.getBoundingClientRect();
  const options = { bubbles: true, cancelable: true, button: 0, altKey: true, pointerId: 101, isPrimary: true, pointerType: 'mouse' };
  content.dispatchEvent(new PointerEvent('pointerdown', { ...options, clientX: rect.left + 10, clientY: rect.top + 6 }));
  content.dispatchEvent(new PointerEvent('pointerup', { ...options, clientX: rect.left + 10, clientY: rect.top + 6 }));
  const grouped = store.selection.blockIds.slice();
  content.dispatchEvent(new PointerEvent('pointerdown', { ...options, clientX: rect.left + 10, clientY: rect.top + 6 }));
  content.dispatchEvent(new PointerEvent('pointerup', { ...options, clientX: rect.left + 10, clientY: rect.top + 6 }));
  const toggledOff = store.selection.blockIds.length;
  return JSON.stringify({ grouped, toggledOff });
})()`));
check('Alt+点击只切换当前区块、再点取消', altSelect.grouped.length === 1 && altSelect.grouped.includes('b2') && altSelect.toggledOff === 0, JSON.stringify(altSelect));

const tocZone = JSON.parse(await evaluate(`(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const store = window.__dafeiyu.store;
  if (!document.querySelector('.toc-item')) {
    window.__dafeiyu.actions.tocAdd(['b1']);
    await sleep(100);
  }
  const before = store.doc.toc.length;
  const first = document.querySelector('.toc-item');
  const blockEl = document.querySelector('.block');
  const blockId = blockEl?.dataset.id;
  const handle = blockEl?.querySelector('.block-handle');
  if (!first || !handle || !blockId) return JSON.stringify({ skipped: true, before, hasItem: Boolean(first), hasHandle: Boolean(handle), blockId });
  const firstId = first.dataset.tocId;
  const firstRect = first.getBoundingClientRect();
  const from = handle.getBoundingClientRect();
  const options = { bubbles: true, cancelable: true, button: 0, buttons: 1, pointerId: 111, isPrimary: true, pointerType: 'mouse' };
  handle.dispatchEvent(new PointerEvent('pointerdown', { ...options, clientX: from.left + 4, clientY: from.top + 4 }));
  document.dispatchEvent(new PointerEvent('pointermove', { ...options, clientX: firstRect.left + 30, clientY: firstRect.top + firstRect.height / 2 }));
  await sleep(60);
  document.dispatchEvent(new PointerEvent('pointerup', { ...options, buttons: 0, clientX: firstRect.left + 30, clientY: firstRect.top + firstRect.height / 2 }));
  await sleep(200);
  const added = store.doc.toc.find((entry) => entry.blockId === blockId);
  return JSON.stringify({ before, after: store.doc.toc.length, parentId: added?.parentId ?? null, firstId, blockId });
})()`));
check('拖块到目录中间成为子级', tocZone.after === tocZone.before + 1 && tocZone.parentId === tocZone.firstId, JSON.stringify(tocZone));

await evaluate('window.__dafeiyu.loadPerfDoc(3000)');

const groupDrag = JSON.parse(await evaluate(`(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const handle = window.__dafeiyu;
  const store = handle.store;
  const ids = ['perf_500', 'perf_501', 'perf_502'];
  store.setSelection({ blockIds: ids, activeId: 'perf_500' });
  const order = () => store.doc.blocks.map((block) => block.id);
  const handleEl = document.querySelector('[data-id="perf_500"] .block-handle');
  const from = handleEl.getBoundingClientRect();
  const targetEl = document.querySelector('[data-id="perf_600"]');
  const target = targetEl.getBoundingClientRect();
  const opts = { bubbles: true, cancelable: true, button: 0, buttons: 1, pointerId: 61, isPrimary: true, pointerType: 'mouse' };
  handleEl.dispatchEvent(new PointerEvent('pointerdown', { ...opts, clientX: from.left + 4, clientY: from.top + 4 }));
  document.dispatchEvent(new PointerEvent('pointermove', { ...opts, clientX: from.left + 4, clientY: target.bottom - 1 }));
  await sleep(60);
  document.dispatchEvent(new PointerEvent('pointerup', { ...opts, buttons: 0, clientX: from.left + 4, clientY: target.bottom - 1 }));
  await sleep(150);
  const order2 = order();
  const start = order2.indexOf('perf_500');
  const consecutive = order2.slice(start, start + 3).join(',') === ids.join(',');
  store.undo();
  return JSON.stringify({ consecutive, start, moved: start > 500 });
})()`));
check('多选拖动移动整组（R4）', groupDrag.consecutive === true && groupDrag.moved === true, JSON.stringify(groupDrag));

const deleteKeep = JSON.parse(await evaluate(`(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const handle = window.__dafeiyu;
  const store = handle.store;
  const ws = document.querySelector('#workspace');
  const settle = () => new Promise((resolve) => setTimeout(resolve, 32));
  const wsRect = ws.getBoundingClientRect();
  const index = Math.min(40, store.doc.blocks.length - 2);
  const target = store.doc.blocks[index];
  const anchorId = store.doc.blocks[index + 1].id;
  const el = document.querySelector('[data-id="' + target.id + '"]');
  ws.scrollTop = Math.max(0, el.offsetTop - 160);
  await sleep(120);
  await settle();
  const anchorBefore = document.querySelector('[data-id="' + anchorId + '"]').getBoundingClientRect().top - wsRect.top;
  store.setSelection({ blockIds: [target.id], activeId: target.id });
  handle.actions.deleteSelection();
  await sleep(150);
  await settle();
  const anchorAfter = document.querySelector('[data-id="' + anchorId + '"]').getBoundingClientRect().top - wsRect.top;
  return JSON.stringify({ anchorBefore, anchorAfter, delta: Math.abs(anchorAfter - anchorBefore), blocks: store.doc.blocks.length });
})()`));
check('删除后视口停在删除点（R2）', deleteKeep.anchorBefore > 0 && deleteKeep.delta <= 3, JSON.stringify(deleteKeep));

const pagination = JSON.parse(await evaluate(`(async () => {
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  window.__dafeiyu.loadPerfDoc(3000);
  const input = document.querySelector('#titlebar-search-input');
  if (document.querySelector('#search')?.hidden) window.__dafeiyu.actions.searchPanel();
  input.value = '性能测试块';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await sleep(150);
  const results = document.querySelector('#search .search-results');
  const firstCount = results.querySelectorAll('.search-hit').length;
  const pagerText = document.querySelector('#search .search-pager')?.textContent ?? '';
  results.scrollTop = results.scrollHeight;
  results.dispatchEvent(new Event('scroll'));
  await sleep(150);
  const secondCount = results.querySelectorAll('.search-hit').length;
  const scrollHeight = results.scrollHeight;
  window.__dafeiyu.actions.searchPanel();
  return JSON.stringify({ firstCount, secondCount, pagerText, scrollHeight });
})()`));
check('搜索结果滚动加载而非分页', pagination.firstCount === 100 && pagination.secondCount === 200 && pagination.pagerText.includes('3000') && pagination.scrollHeight > 0, JSON.stringify(pagination));


const files = JSON.parse(await evaluate(`(async () => {
  const handle = window.__dafeiyu;
  localStorage.setItem('dafeiyu-next.skip-confirm', '1');
  const opened = await handle.openPath(${JSON.stringify(process.env.DAFEIYU_TEST_OPEN || '')});
  const afterOpen = {
    blocks: handle.store.doc.blocks.length,
    title: handle.store.doc.title,
    outline: document.querySelectorAll('#outline .toc-item').length,
    filePath: handle.filePath,
    dirty: handle.dirty,
  };
  const hits = handle.search('洛斯里克').length;
  const saved = await handle.saveAs();
  const exported = await handle.exportDocx();
  return JSON.stringify({ opened, afterOpen, hits, saved, savedPath: handle.filePath, exported });
})()`));
check('打开真实 .dfy（v2 迁移）', files.opened === true && files.afterOpen.blocks >= 100 && files.afterOpen.outline >= 1 && files.afterOpen.dirty === false, JSON.stringify(files.afterOpen));
check('全文搜索命中', files.hits > 0, 'hits=' + files.hits);
check('另存为 / 导出 Word', files.saved === true && Boolean(files.savedPath) && Boolean(files.exported?.path), JSON.stringify({ savedPath: files.savedPath, export: files.exported }));

const theme = JSON.parse(await evaluate(`(() => {
  const before = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
  window.__dafeiyu.actions.theme();
  const after = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
  return JSON.stringify({ before, after });
})()`));
check('主题切换生效', theme.before !== theme.after, JSON.stringify(theme));

const newAndImport = JSON.parse(await evaluate(`(async () => {
  localStorage.setItem('dafeiyu-next.skip-confirm', '1');
  const handle = window.__dafeiyu;
  await handle.actions.newDoc();
  const newBlocks = handle.store.doc.blocks.length;
  await handle.actions.importText();
  const imported = handle.store.doc.blocks;
  return JSON.stringify({
    newBlocks,
    importedBlocks: imported.length,
    hasHeading: imported.some((block) => block.html?.includes('<b>')),
    hasBullet: imported.some((block) => block.type === 'bullet'),
    hasTable: imported.some((block) => block.type === 'table'),
    dirty: handle.dirty,
  });
})()`));
check('新建文档 / 导入 Word（docx）', newAndImport.newBlocks === 1 && newAndImport.importedBlocks >= 4 && newAndImport.hasHeading && newAndImport.hasBullet && newAndImport.hasTable && newAndImport.dirty === true, JSON.stringify(newAndImport));

const commentSelection = JSON.parse(await evaluate(`(() => {
  const handle = window.__dafeiyu;
  const blockId = handle.store.doc.blocks[0].id;
  handle.actions.comment('123123123', blockId);
  const text = document.querySelector('.comment-line[data-comment-id] .comment-line-text');
  if (!text?.firstChild) return JSON.stringify({ error: 'no comment' });
  const range = document.createRange();
  range.setStart(text.firstChild, 2);
  range.setEnd(text.firstChild, 7);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
  const rect = text.getBoundingClientRect();
  text.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: rect.left + 20, clientY: rect.top + 5 }));
  const active = document.querySelector('.comment-line.is-editing .comment-line-text');
  const result = {
    before: '31231',
    after: window.getSelection()?.toString() ?? '',
    active: Boolean(active),
    rangeCount: window.getSelection()?.rangeCount ?? 0,
  };
  active?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
  return JSON.stringify(result);
})()`));
check('进入注释编辑时保留已选文字', commentSelection.active === true && commentSelection.after === commentSelection.before && commentSelection.rangeCount === 1, JSON.stringify(commentSelection));

const noteSearchIcon = JSON.parse(await evaluate(`(async () => {
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const handle = window.__dafeiyu;
  const blockId = handle.store.doc.blocks[0].id;
  handle.actions.comment('NOTE_ICON_SEARCH', blockId);
  const input = document.querySelector('#titlebar-search-input');
  input.value = 'NOTE_ICON_SEARCH';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await sleep(120);
  const hit = document.querySelector('#search .search-hit');
  return JSON.stringify({
    marker: Boolean(hit?.querySelector('.search-comment-marker')),
    icon: Boolean(hit?.querySelector('.search-kind-icon svg')),
    comments: Boolean(hit?.querySelector('.search-hit-comments')),
  });
})()`));
check('注释搜索结果使用左侧注释标记且不显示类型图标', noteSearchIcon.marker === true && noteSearchIcon.icon === false && noteSearchIcon.comments === false, JSON.stringify(noteSearchIcon));

const commentHighlight = JSON.parse(await evaluate(`(async () => {
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const handle = window.__dafeiyu;
  const blockId = handle.store.doc.blocks.find((block) => !handle.store.doc.annotations.some(
    (annotation) => annotation.type === 'comment' && annotation.anchor.blockId === block.id,
  ))?.id;
  if (!blockId) return JSON.stringify({ error: 'no empty block' });
  handle.actions.openNotes(blockId);
  const editor = document.querySelector('.comment-line.is-editing .comment-line-text');
  editor.textContent = 'AAABBBCCC';
  const range = document.createRange();
  range.setStart(editor.firstChild, 3);
  range.setEnd(editor.firstChild, 6);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
  document.querySelector('#btn-highlight').click();
  const note = handle.store.doc.annotations.filter((item) => item.type === 'comment').slice(-1)[0];
  const marked = Boolean(note?.html.includes('data-highlight'));
  const saved = note?.format === 'html';
  const closed = !document.querySelector('.comment-line.is-editing');
  const searchInput = document.querySelector('#titlebar-search-input');
  searchInput.value = 'BBB';
  searchInput.dispatchEvent(new Event('input', { bubbles: true }));
  await sleep(120);
  const searchHighlight = Boolean(document.querySelector('#search .search-snippet [data-highlight]'));
  const display = note && document.querySelector('.comment-line[data-comment-id="' + note.id + '"] .comment-line-text');
  display?.parentElement?.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 10, clientY: 10 }));
  const reopened = Boolean(document.querySelector('.comment-line.is-editing [data-highlight]'));
  const active = document.querySelector('.comment-line.is-editing [data-highlight]');
  if (active) {
    const next = document.createRange();
    next.selectNodeContents(active);
    next.collapse(false);
    selection.removeAllRanges();
    selection.addRange(next);
    document.querySelector('#btn-highlight-delete').click();
  }
  const updated = note && handle.store.doc.annotations.find((item) => item.id === note.id);
  const removed = Boolean(updated && !updated.html.includes('data-highlight'));
  const closedAfterRemove = !document.querySelector('.comment-line.is-editing');
  return JSON.stringify({ marked, saved, closed, searchHighlight, reopened, removed, closedAfterRemove });
})()`));
check('注释内文字可高亮', commentHighlight.marked === true && commentHighlight.saved === true && commentHighlight.closed === true && commentHighlight.searchHighlight === true && commentHighlight.reopened === true && commentHighlight.removed === true && commentHighlight.closedAfterRemove === true, JSON.stringify(commentHighlight));

const commentTextColor = JSON.parse(await evaluate(`(() => {
  const handle = window.__dafeiyu;
  const blockId = handle.store.doc.blocks[0].id;
  handle.actions.openNotes(blockId);
  const editor = document.querySelector('.comment-line.is-editing .comment-line-text');
  editor.textContent = 'AAABBBCCC';
  const range = document.createRange();
  range.setStart(editor.firstChild, 3);
  range.setEnd(editor.firstChild, 6);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
  document.querySelector('#btn-text-color').click();
  const note = handle.store.doc.annotations.filter((item) => item.type === 'comment').slice(-1)[0];
  const display = document.querySelector('.comment-line[data-comment-id="' + note.id + '"] .comment-line-text');
  const span = display?.querySelector('span');
  return JSON.stringify({
    format: note.format,
    html: note.html,
    editing: Boolean(document.querySelector('.comment-line.is-editing')),
    color: span ? getComputedStyle(span).color : '',
  });
})()`));
check('注释内文字可改颜色', commentTextColor.editing === false && commentTextColor.html.includes('color:') && commentTextColor.color !== '', JSON.stringify(commentTextColor));


const legacyComment = JSON.parse(await evaluate(`(() => {
  const handle = window.__dafeiyu;
  const blockId = handle.store.doc.blocks[0].id;
  handle.actions.comment('<b>literal</b>', blockId);
  const texts = [...document.querySelectorAll('.comment-display[data-block-id="' + blockId + '"] .comment-line-text')];
  const text = texts[texts.length - 1];
  return JSON.stringify({ text: text?.textContent ?? '', bold: Boolean(text?.querySelector('b')) });
})()`));
check('旧注释按纯文本显示', legacyComment.text === '<b>literal</b>' && legacyComment.bold === false, JSON.stringify(legacyComment));

const noteRichSearch = JSON.parse(await evaluate(`(async () => {
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const handle = window.__dafeiyu;
  const blockId = handle.store.doc.blocks[0].id;
  handle.store.dispatch(() => [{
    t: 'patchDoc',
    patch: { annotations: [...handle.store.doc.annotations, {
      id: 'note_rich_search',
      type: 'comment',
      anchor: { blockId },
      html: 'RICHRICH<span style="color:rgb(156, 163, 175)">BBB</span>CCC',
      format: 'html',
    }] },
  }]);
  const input = document.querySelector('#titlebar-search-input');
  input.value = 'RICHRICH';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await sleep(120);
  const rich = document.querySelector('#search .search-snippet span[style*="color"]');
  return JSON.stringify({
    found: Boolean(rich),
    color: rich ? getComputedStyle(rich).color : '',
    text: rich?.textContent ?? '',
  });
})()`));
check('注释搜索结果保留字体颜色', noteRichSearch.found === true && noteRichSearch.color !== '' && noteRichSearch.text === 'BBB', JSON.stringify(noteRichSearch));

const backspaceGuard = JSON.parse(await evaluate(`(() => {
  const store = window.__dafeiyu.store;
  const first = store.doc.blocks[0];
  const second = store.doc.blocks[1];
  store.dispatch(() => [
    { t: 'patchBlock', id: first.id, patch: { html: 'FIRST' } },
    { t: 'patchBlock', id: second.id, patch: { html: 'SECOND' } },
  ]);
  const content = document.querySelector('[data-id="' + second.id + '"] .block-content');
  const range = document.createRange();
  range.selectNodeContents(content);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
  content.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true, cancelable: true }));
  return JSON.stringify({ count: store.doc.blocks.length, b1: store.doc.blocks.find((block) => block.id === first.id)?.html, b2: store.doc.blocks.find((block) => block.id === second.id)?.html });
})()`));
check('反向选区按退格不会合并上方区块', backspaceGuard.count >= 2 && backspaceGuard.b1 === 'FIRST' && backspaceGuard.b2 === 'SECOND', JSON.stringify(backspaceGuard));

const textMark = JSON.parse(await evaluate(`(() => {
  const store = window.__dafeiyu.store;
  const target = store.doc.blocks[1];
  const content = document.querySelector('[data-id="' + target.id + '"] .block-content');
  content.focus();
  const range = document.createRange();
  range.selectNodeContents(content);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
  document.querySelector('#btn-mark').click();
  const marked = store.doc.annotations.some((annotation) => annotation.type === 'mark' && annotation.anchor.blockId === target.id);
  return JSON.stringify({ marked });
})()`));
check('选中文本后可直接标记所在区块', textMark.marked === true, JSON.stringify(textMark));

const commentImageMenu = JSON.parse(await evaluate(`(() => {
  const handle = window.__dafeiyu;
  const blockId = handle.store.doc.blocks[0].id;
  const note = {
    id: 'comment_image_menu_test',
    type: 'comment',
    anchor: { blockId },
    html: 'IMG',
    format: 'html',
    images: ['data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='],
    imageWidths: [100],
    imageAligns: ['left'],
  };
  handle.store.dispatch(() => [{ t: 'patchDoc', patch: { annotations: [...handle.store.doc.annotations, note] } }]);
  const wrap = document.querySelector('.comment-line[data-comment-id="comment_image_menu_test"] .comment-line-image-wrap');
  const rect = wrap.getBoundingClientRect();
  wrap.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: rect.left + 5, clientY: rect.top + 5 }));
  const labels = [...document.querySelectorAll('.context-menu-item')].map((item) => item.textContent.trim());
  [...document.querySelectorAll('.context-menu-item')].find((item) => item.textContent.trim() === '居中')?.click();
  const aligned = handle.store.doc.annotations.find((item) => item.id === 'comment_image_menu_test')?.imageAligns?.[0];
  const nextWrap = document.querySelector('.comment-line[data-comment-id="comment_image_menu_test"] .comment-line-image-wrap');
  const nextRect = nextWrap.getBoundingClientRect();
  nextWrap.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: nextRect.left + 5, clientY: nextRect.top + 5 }));
  [...document.querySelectorAll('.context-menu-item')].find((item) => item.textContent.trim() === '删除图片')?.click();
  const images = handle.store.doc.annotations.find((item) => item.id === 'comment_image_menu_test')?.images?.length;
  return JSON.stringify({ labels, aligned, images });
})()`));
check('注释图片拥有完整图片菜单', commentImageMenu.labels.includes('居中') && commentImageMenu.labels.includes('水平翻转') && commentImageMenu.labels.includes('裁剪…') && commentImageMenu.aligned === 'center' && commentImageMenu.images === 0, JSON.stringify(commentImageMenu));

const ctrlAOutline = JSON.parse(await evaluate(`(() => {
  const store = window.__dafeiyu.store;
  const [first, second] = store.doc.blocks;
  store.dispatch(() => [{ t: 'patchDoc', patch: { toc: [
    { id: 'ctrl_a_toc_1', blockId: first.id, blockIds: [], label: '目录一', parentId: null, level: 1 },
    { id: 'ctrl_a_toc_2', blockId: second.id, blockIds: [], label: '目录二', parentId: 'ctrl_a_toc_1', level: 2 },
  ] } }]);
  const outline = document.querySelector('#outline');
  outline.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'mouse' }));
  document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', ctrlKey: true, bubbles: true, cancelable: true }));
  const items = [...document.querySelectorAll('.toc-item[data-toc-id]')];
  return JSON.stringify({ selected: items.filter((item) => item.classList.contains('is-selected')).length, total: items.length, text: getSelection().toString() });
})()`));
check('目录区 Ctrl+A 只多选目录项', ctrlAOutline.total >= 2 && ctrlAOutline.selected === ctrlAOutline.total && ctrlAOutline.text === '', JSON.stringify(ctrlAOutline));

const ctrlAEditor = JSON.parse(await evaluate(`(() => {
  const store = window.__dafeiyu.store;
  const blocks = store.doc.blocks;
  const first = blocks[0];
  const second = blocks[1];
  store.dispatch(() => [{ t: 'patchDoc', patch: { annotations: [...store.doc.annotations, {
    id: 'ctrl_a_comment',
    type: 'comment',
    anchor: { blockId: first.id },
    html: 'CTRL A COMMENT',
    format: 'html',
  }] } }]);
  const paper = document.querySelector('#blocks');
  document.activeElement?.blur?.();
  paper.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'mouse' }));
  document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', ctrlKey: true, bubbles: true, cancelable: true }));
  const allSelected = store.selection.blockIds.length === blocks.length;
  const noTextSelection = getSelection().toString() === '';
  const commentHost = document.querySelector('.comment-display[data-block-id="' + first.id + '"]');
  const commentSelected = Boolean(commentHost?.classList.contains('is-block-selected'));

  const content = document.querySelector('[data-id="' + second.id + '"] .block-content');
  content.focus();
  document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', ctrlKey: true, bubbles: true, cancelable: true }));
  const editingSelection = getSelection();
  const editingText = editingSelection.toString();
  const editingNode = editingSelection.anchorNode;
  const onlyCurrentBlock = Boolean(editingNode && content.contains(editingNode));

  document.activeElement?.blur?.();
  paper.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'mouse' }));
  document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', ctrlKey: true, bubbles: true, cancelable: true }));
  document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true, cancelable: true }));
  return JSON.stringify({ allSelected, noTextSelection, commentSelected, editingText: editingText.slice(0, 20), onlyCurrentBlock, blocks: store.doc.blocks.length, html: store.doc.blocks[0]?.html });
})()`));
check('正文区 Ctrl+A 以区块为单位选中并高亮注释', ctrlAEditor.allSelected === true && ctrlAEditor.noTextSelection === true && ctrlAEditor.commentSelected === true, JSON.stringify(ctrlAEditor));
check('编辑区块时 Ctrl+A 只选当前块文本', ctrlAEditor.editingText.length > 0 && ctrlAEditor.onlyCurrentBlock === true, JSON.stringify(ctrlAEditor));
check('区块全选后 Delete 删除所有区块', ctrlAEditor.blocks === 1 && ctrlAEditor.html === '', JSON.stringify(ctrlAEditor));

const altComment = JSON.parse(await evaluate(`(() => {
  const handle = window.__dafeiyu;
  const block = handle.store.doc.blocks[0];
  handle.store.dispatch(() => [{ t: 'patchDoc', patch: { annotations: [...handle.store.doc.annotations, {
    id: 'alt_comment_test',
    type: 'comment',
    anchor: { blockId: block.id },
    html: 'ALT COMMENT',
    format: 'html',
  }] } }]);
  const line = document.querySelector('.comment-line[data-comment-id="alt_comment_test"]');
  const rect = line.getBoundingClientRect();
  const click = (altKey) => {
    line.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerType: 'mouse', button: 0, altKey, clientX: rect.left + 5, clientY: rect.top + 5 }));
    document.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerType: 'mouse', button: 0, altKey, clientX: rect.left + 5, clientY: rect.top + 5 }));
  };
  click(true);
  const selected = line.classList.contains('is-selected');
  click(true);
  const toggledOff = !line.classList.contains('is-selected');
  const drag = line.querySelector('.comment-drag');
  const data = new DataTransfer();
  drag.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: data }));
  const dragging = document.body.classList.contains('is-comment-dragging');
  const cursor = getComputedStyle(line).cursor;
  drag.dispatchEvent(new DragEvent('dragend', { bubbles: true, cancelable: true, dataTransfer: data }));
  const cleaned = !document.body.classList.contains('is-comment-dragging');
  return JSON.stringify({ selected, toggledOff, dragging, cursor, cleaned, editor: Boolean(document.querySelector('.comment-line.is-editing')) });
})()`));
check('Alt 单击注释可切换选中，拖动时禁止光标', altComment.selected === true && altComment.toggledOff === true && altComment.dragging === true && altComment.cursor === 'not-allowed' && altComment.cleaned === true && altComment.editor === false, JSON.stringify(altComment));

const commentGap = JSON.parse(await evaluate(`(async () => {
  const handle = window.__dafeiyu;
  const last = handle.store.doc.blocks[handle.store.doc.blocks.length - 1];
  handle.actions.openNotes(last.id);
  const editor = document.querySelector('.comment-line.is-editing .comment-line-text');
  if (editor) editor.textContent = '1';
  const blankPoint = () => {
    const extension = document.querySelector('.comment-display[data-block-id="' + last.id + '"]').getBoundingClientRect();
    return { x: extension.left + 100, y: extension.bottom + 20 };
  };
  const clickBlank = () => {
    const { x, y } = blankPoint();
    const target = document.querySelector('#blocks');
    target?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerType: 'mouse', button: 0, clientX: x, clientY: y }));
    target?.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, pointerType: 'mouse', button: 0, clientX: x, clientY: y }));
    target?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, clientX: x, clientY: y }));
  };
  clickBlank();
  const afterCommit = handle.store.doc.blocks.length;
  await new Promise((resolve) => setTimeout(resolve, 50));
  clickBlank();
  const afterSecondClick = handle.store.doc.blocks.length;
  return JSON.stringify({ afterCommit, afterSecondClick });
})()`));
check('注释保存后需第二次点击空白才新建区块', commentGap.afterCommit === 1 && commentGap.afterSecondClick === 2, JSON.stringify(commentGap));


const draftSpacing = JSON.parse(await evaluate(`(() => {
  const handle = window.__dafeiyu;
  const block = handle.store.doc.blocks[0];
  handle.store.dispatch(() => [{ t: 'patchDoc', patch: { annotations: [1, 2, 3].map((n) => ({
    id: 'spacing_' + n,
    type: 'comment',
    anchor: { blockId: block.id },
    html: String(n),
    format: 'html',
  })) } }]);
  handle.actions.openNotes(block.id);
  const host = document.querySelector('.comment-display[data-block-id="' + block.id + '"]');
  const draft = host?.querySelector('.comment-draft');
  return JSON.stringify({
    margin: draft ? getComputedStyle(draft).marginTop : '',
    previous: draft?.previousElementSibling?.classList.contains('comment-line') ?? false,
    tailLast: host?.lastElementChild?.classList.contains('comment-drop-tail') ?? false,
  });
})()`));
check('新建注释草稿与上一条注释保持间距', draftSpacing.margin === '4px' && draftSpacing.previous === true && draftSpacing.tailLast === true, JSON.stringify(draftSpacing));

const closeComment = JSON.parse(await evaluate(`(() => {
  const handle = window.__dafeiyu;
  const before = handle.store.doc.blocks.length;
  document.querySelector('[data-note-close]')?.click();
  return JSON.stringify({ before, after: handle.store.doc.blocks.length, editing: Boolean(document.querySelector('.comment-line.is-editing')) });
})()`));
check('关闭注释不会在末尾新建区块', closeComment.before === closeComment.after && closeComment.editing === false, JSON.stringify(closeComment));

const mergeCaret = JSON.parse(await evaluate(`(async () => {
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const store = window.__dafeiyu.store;
  const textTypes = new Set(['paragraph', 'quote', 'bullet', 'number']);
  const blocks = store.doc.blocks;
  const pair = blocks.find((block, index) => index > 0 && textTypes.has(block.type) && textTypes.has(blocks[index - 1].type));
  const previous = pair ? blocks[blocks.indexOf(pair) - 1] : null;
  if (!pair || !previous) return JSON.stringify({ skipped: true });
  store.dispatch(() => [
    { t: 'patchBlock', id: previous.id, patch: { html: '<span style="font-weight:700">PREV</span>' } },
    { t: 'patchBlock', id: pair.id, patch: { html: 'CURR' } },
  ]);
  const content = document.querySelector('[data-id="' + pair.id + '"] .block-content');
  content.focus();
  const range = document.createRange();
  range.setStart(content.firstChild, 0);
  range.collapse(true);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
  content.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true, cancelable: true }));
  await sleep(120);
  const active = document.querySelector('[data-id="' + previous.id + '"] .block-content');
  return JSON.stringify({
    html: store.doc.blocks.find((block) => block.id === previous.id)?.html,
    caretText: window.getSelection()?.anchorNode?.textContent,
    caretOffset: window.getSelection()?.anchorOffset,
    active: document.activeElement === active,
    removed: !store.doc.blocks.some((block) => block.id === pair.id),
  });
})()`));
check('Backspace merge keeps caret at block junction', !mergeCaret.skipped && mergeCaret.caretText === 'PREV' && mergeCaret.caretOffset === 4 && mergeCaret.active && mergeCaret.removed, JSON.stringify(mergeCaret));

const i18nUi = JSON.parse(await evaluate(`(() => {
  const select = document.querySelector('#language-select');
  return JSON.stringify({
    options: select ? [...select.options].map((option) => option.value) : [],
    value: select?.value,
    lang: document.documentElement.lang,
  });
})()`));
check('language selector is available', i18nUi.options.join(',') === 'zh-CN,en' && i18nUi.value === 'zh-CN' && i18nUi.lang === 'zh-CN', JSON.stringify(i18nUi));

const aboutModal = JSON.parse(await evaluate(`(() => {
  document.querySelector('#btn-about')?.click();
  const overlay = document.querySelector('#about-overlay');
  const scroll = document.querySelector('#about-scroll');
  const close = document.querySelector('#btn-about-close');
  const heading = document.querySelector('.about-support-title');
  const opened = Boolean(overlay && !overlay.hidden);
  const scrollable = Boolean(scroll && scroll.scrollHeight > scroll.clientHeight);
  const headingAtTop = Boolean(heading && scroll && heading.getBoundingClientRect().top < scroll.getBoundingClientRect().bottom);
  close?.click();
  return JSON.stringify({ opened, scrollable, closed: Boolean(overlay?.hidden) });
})()`));
check('about window opens, scrolls and closes', aboutModal.opened && aboutModal.scrollable && aboutModal.closed, JSON.stringify(aboutModal));

if (clipboardSnapshot) await evaluate(`window.__dafeiyu.clipboard?.restore(${JSON.stringify(clipboardSnapshot)})`);
finish();
