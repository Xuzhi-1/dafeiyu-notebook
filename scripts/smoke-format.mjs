/** 粘贴清洗与多选格式回归。 */

import { check, evaluate, finish, sleep } from './smoke/harness.mjs';

for (let i = 0; i < 30; i += 1) {
  if (await evaluate('Boolean(window.__dafeiyu?.ready)')) break;
  await sleep(200);
}

const baseline = JSON.parse(await evaluate(`(async () => {
  const store = window.__dafeiyu.store;
  store.dispatch((doc) => [{ t: 'insertBlocks', at: doc.blocks.length, blocks: [{ id: 'default_size_test', type: 'paragraph', html: '默认字号' }] }]);
  store.setSelection({ blockIds: ['default_size_test'], activeId: 'default_size_test' });
  await new Promise((resolve) => setTimeout(resolve, 60));
  const block = document.querySelector('[data-id="default_size_test"] .block-content');
  return JSON.stringify({ css: getComputedStyle(block).fontSize, input: document.querySelector('#font-size-input')?.value });
})()`));
check('默认字号 16', baseline.css === '16px' && baseline.input === '16', JSON.stringify(baseline));

const paste = JSON.parse(await evaluate(`(async () => {
  const handle = window.__dafeiyu;
  const block = handle.store.doc.blocks.find((item) => ['paragraph', 'quote', 'bullet', 'number'].includes(item.type));
  if (!block) return JSON.stringify({ model: '', text: '' });
  const content = document.querySelector('.block[data-id="' + block.id + '"] .block-content');
  content.focus();
  const range = document.createRange();
  range.selectNodeContents(content);
  const selection = getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
  const data = new DataTransfer();
  data.setData('text/html', '<html><head><style>@font-face{font-family:SimSun;panose-1:2 1 6}</style></head><body><p class=MsoNormal>第一段</p><p class=MsoNormal>第二段</p></body></html>');
  data.setData('text/plain', '第一段 第二段');
  content.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
  await new Promise((resolve) => setTimeout(resolve, 80));
  const model = handle.store.doc.blocks.find((item) => item.id === block.id)?.html ?? '';
  return JSON.stringify({ model, text: content.textContent ?? '' });
})()`));
check('Word 粘贴不显示 CSS 代码且保留换行',
  paste.model.includes('<br>') && !paste.model.includes('@font-face') && !paste.model.includes('MsoNormal'),
  JSON.stringify(paste));

const multi = JSON.parse(await evaluate(`(async () => {
  const handle = window.__dafeiyu;
  const store = handle.store;
  const ids = ['fmt_a', 'fmt_b'];
  store.dispatch((doc) => [{ t: 'insertBlocks', at: doc.blocks.length, blocks: [
    { id: 'fmt_a', type: 'paragraph', html: '格式 A' },
    { id: 'fmt_b', type: 'paragraph', html: '格式 B' },
  ] }]);
  await new Promise((resolve) => setTimeout(resolve, 40));
  store.setSelection({ blockIds: ids, activeId: 'fmt_a' });
  getSelection()?.removeAllRanges();
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  document.querySelector('#font-size-menu').click();
  await sleep(30);
  document.querySelector('.size-popover [data-size="20"]')?.click();
  await sleep(30);
  const family = document.querySelector('#font-family');
  family.value = 'MiSans';
  family.dispatchEvent(new Event('change', { bubbles: true }));
  await sleep(20);
  document.querySelector('#btn-bold').click();
  document.querySelector('#btn-italic').click();
  document.querySelector('#btn-underline').click();
  document.querySelector('#btn-strike').click();
  document.querySelector('#btn-text-color').click();
  document.querySelector('#btn-highlight').click();
  await sleep(100);
  const blocks = ids.map((id) => store.doc.blocks.find((block) => block.id === id));
  return JSON.stringify({
    sizes: blocks.map((block) => block?.fontSize),
    families: blocks.map((block) => block?.fontFamily),
    html: blocks.map((block) => block?.html ?? ''),
    selection: store.selection.blockIds,
  });
})()`));
check('多选区块应用字号、字体、粗斜下删、颜色和高亮',
  multi.sizes.every((size) => size === 20)
  && multi.families.every((family) => family === 'MiSans')
  && multi.selection.length === 2
  && multi.html.every((html) => /<b>|<i>|<u>|<s>|color:|data-highlight/.test(html)),
  JSON.stringify(multi));

const mixedSize = JSON.parse(await evaluate(`(async () => {
  const store = window.__dafeiyu.store;
  store.dispatch(() => [{ t: 'patchBlock', id: 'fmt_a', patch: { fontSize: 20 } }, { t: 'patchBlock', id: 'fmt_b', patch: { fontSize: 24 } }]);
  store.setSelection({ blockIds: ['fmt_a', 'fmt_b'], activeId: 'fmt_a' });
  await new Promise((resolve) => setTimeout(resolve, 60));
  const mixed = document.querySelector('#font-size-input')?.value;
  store.setSelection({ blockIds: ['fmt_a'], activeId: 'fmt_a' });
  await new Promise((resolve) => setTimeout(resolve, 60));
  return JSON.stringify({ mixed, single: document.querySelector('#font-size-input')?.value });
})()`));
check('多选不同字号时字号框为空', mixedSize.mixed === '' && mixedSize.single === '20', JSON.stringify(mixedSize));

const split = JSON.parse(await evaluate(`(async () => {
  const store = window.__dafeiyu.store;
  store.dispatch((doc) => [{ t: 'insertBlocks', at: doc.blocks.length, blocks: [{ id: 'split_test', type: 'paragraph', html: '末尾换行<br>' }] }]);
  await new Promise((resolve) => setTimeout(resolve, 40));
  const content = document.querySelector('[data-id="split_test"] .block-content');
  content.focus();
  const range = document.createRange();
  range.selectNodeContents(content);
  range.collapse(false);
  const selection = getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
  content.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
  await new Promise((resolve) => setTimeout(resolve, 60));
  const next = store.doc.blocks.find((block) => block.id === store.selection.activeId);
  return JSON.stringify({ html: next?.html ?? '', type: next?.type });
})()`));
check('末尾换行回车不产生前导换行', split.type === 'paragraph' && !/^<br/i.test(split.html), JSON.stringify(split));

const mixed = JSON.parse(await evaluate(`(async () => {
  const store = window.__dafeiyu.store;
  store.dispatch((doc) => [{ t: 'insertBlocks', at: doc.blocks.length, blocks: [{ id: 'mix_target', type: 'paragraph', html: '' }] }]);
  store.setSelection({ blockIds: ['mix_target'], activeId: 'mix_target' });
  await new Promise((resolve) => setTimeout(resolve, 30));
  const content = document.querySelector('[data-id="mix_target"] .block-content');
  content.focus();
  const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nXQAAAAASUVORK5CYII=';
  const data = new DataTransfer();
  data.setData('text/html', '<p>前文</p><p><img src="data:image/png;base64,' + png + '"></p><p>后文</p>');
  data.setData('text/plain', '前文 后文');
  content.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
  await new Promise((resolve) => setTimeout(resolve, 250));
  const selected = store.selection.blockIds.map((id) => store.doc.blocks.find((block) => block.id === id));
  const image = selected.find((block) => block?.type === 'image');
  store.setSelection({ blockIds: [image.id], activeId: image.id });
  await new Promise((resolve) => setTimeout(resolve, 30));
  document.querySelector('#btn-center').click();
  await new Promise((resolve) => setTimeout(resolve, 60));
  const aligned = store.doc.blocks.find((block) => block.id === image.id)?.align;
  return JSON.stringify({ types: selected.map((block) => block?.type), html: selected.map((block) => block?.html ?? ''), aligned });
})()`));
check('图文混合粘贴按图片位置分块',
  mixed.types.length === 3
  && mixed.types[0] === 'paragraph'
  && mixed.types[1] === 'image'
  && mixed.types[2] === 'paragraph'
  && mixed.html[0] === '前文'
  && mixed.html[2] === '后文'
  && mixed.aligned === 'center',
  JSON.stringify(mixed));

const noScroll = JSON.parse(await evaluate(`(async () => {
  const store = window.__dafeiyu.store;
  const workspace = document.querySelector('.workspace');
  store.dispatch((doc) => [{ t: 'insertBlocks', at: doc.blocks.length, blocks: [{ id: 'no_scroll_test', type: 'paragraph', html: '末尾' }] }]);
  store.setSelection({ blockIds: ['no_scroll_test'], activeId: 'no_scroll_test' });
  await new Promise((resolve) => setTimeout(resolve, 40));
  workspace.scrollTop = workspace.scrollHeight;
  const content = document.querySelector('[data-id="no_scroll_test"] .block-content');
  content.focus();
  const range = document.createRange();
  range.selectNodeContents(content);
  range.collapse(false);
  const selection = getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
  await new Promise((resolve) => setTimeout(resolve, 30));
  const before = workspace.scrollTop;
  content.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
  await new Promise((resolve) => setTimeout(resolve, 60));
  const mid = workspace.scrollTop;
  const next = document.querySelector('[data-id="' + store.selection.activeId + '"] .block-content');
  const range2 = document.createRange();
  range2.selectNodeContents(next);
  range2.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range2);
  next.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
  await new Promise((resolve) => setTimeout(resolve, 60));
  return JSON.stringify({ before, mid, after: workspace.scrollTop });
})()`));
check('末尾新建区块不滚动视图', noScroll.before === noScroll.mid && noScroll.mid === noScroll.after, JSON.stringify(noScroll));

const reveal = JSON.parse(await evaluate(`(async () => {
  const store = window.__dafeiyu.store;
  const workspace = document.querySelector('.workspace');
  store.dispatch((doc) => [{ t: 'insertBlocks', at: doc.blocks.length, blocks: [{ id: 'reveal_test', type: 'paragraph', html: '整块显示测试文字<br>第二行<br>第三行' }] }]);
  store.setSelection({ blockIds: ['reveal_test'], activeId: 'reveal_test' });
  await new Promise((resolve) => setTimeout(resolve, 40));
  const block = document.querySelector('[data-id="reveal_test"]');
  const content = block.querySelector('.block-content');
  workspace.scrollTop = 0;
  await new Promise((resolve) => setTimeout(resolve, 30));
  content.focus({ preventScroll: true });
  const beforeScroll = workspace.scrollTop;
  content.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: 'x' }));
  await new Promise((resolve) => setTimeout(resolve, 80));
  content.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: 'x' }));
  await new Promise((resolve) => setTimeout(resolve, 300));
  const area = workspace.getBoundingClientRect();
  const rect = block.getBoundingClientRect();
  return JSON.stringify({ beforeScroll, afterScroll: workspace.scrollTop, top: rect.top - area.top, bottom: area.bottom - rect.bottom, height: rect.height, viewport: area.height });
})()`));
check('输入时整块显示', reveal.top >= -1 && reveal.bottom >= -1, JSON.stringify(reveal));

const tableSearch = JSON.parse(await evaluate(`(async () => {
  const handle = window.__dafeiyu;
  const store = handle.store;
  store.dispatch((doc) => [{ t: 'insertBlocks', at: doc.blocks.length, blocks: [{
    id: 'search_table_test', type: 'table', html: '',
    meta: {
      rows: [[''], ['<span style="color:rgb(192, 0, 0)"><span data-highlight="marker" style="background-color:rgb(255, 226, 122)">TABLE_ONLY</span></span>'], ['TABLE_ONLY 2']],
      header: false,
      richText: true,
    },
  }] }]);
  await new Promise((resolve) => setTimeout(resolve, 80));
  if (document.querySelector('#search')?.hidden) handle.actions.searchPanel();
  const input = document.querySelector('#titlebar-search-input');
  input.value = 'TABLE_ONLY';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await new Promise((resolve) => setTimeout(resolve, 120));
  const hits = [...document.querySelectorAll('#search .search-hit[data-search-block="search_table_test"]')];
  const hit = hits[0];
  const colored = Boolean(hit?.querySelector('.search-snippet span[style*="color"]'));
  const highlighted = Boolean(hit?.querySelector('.search-snippet [data-highlight]'));
  const firstIcon = Boolean(hit?.querySelector('.search-table-icon'));
  const secondIcon = Boolean(hits[1]?.querySelector('.search-table-icon'));
  const firstX = hit?.querySelector('.search-snippet')?.getBoundingClientRect().left ?? 0;
  const secondX = hits[1]?.querySelector('.search-snippet')?.getBoundingClientRect().left ?? 0;
  hit?.click();
  await new Promise((resolve) => setTimeout(resolve, 120));
  const active = document.activeElement;
  return JSON.stringify({
    hit: Boolean(hit),
    row: hit?.dataset.searchRow,
    column: hit?.dataset.searchColumn,
    colored,
    highlighted,
    firstIcon,
    secondIcon,
    aligned: Math.abs(firstX - secondX) < 1,
    focused: active instanceof HTMLElement && active.dataset.row === '1' && active.dataset.column === '0',
  });
})()`));
check('表格搜索结果保留颜色/高亮并可定位单元格',
  tableSearch.hit && tableSearch.row === '1' && tableSearch.column === '0'
  && tableSearch.colored && tableSearch.highlighted
  && tableSearch.firstIcon && !tableSearch.secondIcon
  && tableSearch.aligned && tableSearch.focused,
  JSON.stringify(tableSearch));

const commentPaste = JSON.parse(await evaluate(`(async () => {
  const handle = window.__dafeiyu;
  const blockId = handle.store.doc.blocks[0].id;
  handle.actions.comment(' 123123123', blockId);
  handle.actions.openNotes(blockId);
  await new Promise((resolve) => setTimeout(resolve, 80));
  const line = document.querySelector('.comment-line[data-comment-id]');
  line?.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 10, clientY: 10 }));
  await new Promise((resolve) => setTimeout(resolve, 80));
  const editor = document.querySelector('.comment-line.is-editing .comment-line-text');
  if (!editor) return JSON.stringify({ error: 'no editor' });
  const range = document.createRange();
  range.selectNodeContents(editor);
  const selection = getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
  const data = new DataTransfer();
  editor.dispatchEvent(new ClipboardEvent('copy', { clipboardData: data, bubbles: true, cancelable: true }));
  editor.innerHTML = '';
  editor.focus();
  const end = document.createRange();
  end.selectNodeContents(editor);
  end.collapse(false);
  selection.removeAllRanges();
  selection.addRange(end);
  editor.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
  await new Promise((resolve) => setTimeout(resolve, 80));
  return JSON.stringify({ html: editor.innerHTML, text: editor.textContent ?? '' });
})()`));
check('复制注释粘贴不产生额外换行',
  commentPaste.text === '123123123' && !/^<br/i.test(commentPaste.html) && !commentPaste.html.includes('<div'),
  JSON.stringify(commentPaste));

const wrappedPaste = JSON.parse(await evaluate(`(async () => {
  const store = window.__dafeiyu.store;
  store.dispatch((doc) => [{ t: 'insertBlocks', at: doc.blocks.length, blocks: [{ id: 'wrapped_paste', type: 'paragraph', html: '' }] }]);
  await new Promise((resolve) => setTimeout(resolve, 30));
  const content = document.querySelector('[data-id="wrapped_paste"] .block-content');
  content.focus();
  const range = document.createRange();
  range.selectNodeContents(content);
  range.collapse(false);
  const selection = getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
  const data = new DataTransfer();
  const nl = String.fromCharCode(13, 10);
  data.setData('text/html', '<html>' + nl + '<body>' + nl + '<!--StartFragment-->123<!--EndFragment-->' + nl + '</body>' + nl + '</html>');
  data.setData('text/plain', '123');
  content.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
  await new Promise((resolve) => setTimeout(resolve, 100));
  const block = store.doc.blocks.find((item) => item.id === 'wrapped_paste');
  return JSON.stringify({ html: block?.html, text: content.textContent ?? '' });
})()`));
check('剪贴板 HTML 包装不引入前导空格',
  wrappedPaste.html === '123' && wrappedPaste.text === '123',
  JSON.stringify(wrappedPaste));

const multiRich = JSON.parse(await evaluate(`(async () => {
  const handle = window.__dafeiyu;
  const store = handle.store;
  store.dispatch((doc) => [{ t: 'insertBlocks', at: doc.blocks.length, blocks: [
    { id: 'rich_text_target', type: 'paragraph', html: 'RICH_TEXT' },
    { id: 'rich_table_target', type: 'table', html: '', meta: { rows: [['RICH_CELL']], richText: true } },
  ] }]);
  await new Promise((resolve) => setTimeout(resolve, 60));
  handle.actions.comment('RICH_COMMENT', 'rich_text_target');
  await new Promise((resolve) => setTimeout(resolve, 80));
  const noteId = store.doc.annotations.find((note) => note.type === 'comment' && note.html === 'RICH_COMMENT')?.id;
  const ids = ['rich_text_target', 'rich_table_target'];
  store.setSelection({ blockIds: ids, activeId: ids[0] });
  document.querySelector('#btn-bold').click();
  document.querySelector('#btn-text-color').click();
  document.querySelector('#btn-highlight').click();
  document.querySelector('#btn-center').click();
  await new Promise((resolve) => setTimeout(resolve, 120));
  const before = {
    text: store.doc.blocks.find((block) => block.id === 'rich_text_target')?.html ?? '',
    cell: store.doc.blocks.find((block) => block.id === 'rich_table_target')?.meta?.rows?.[0]?.[0] ?? '',
    note: store.doc.annotations.find((note) => note.id === noteId)?.html ?? '',
    tableAlign: store.doc.blocks.find((block) => block.id === 'rich_table_target')?.meta?.cellAligns?.[0]?.[0] ?? '',
  };
  store.setSelection({ blockIds: ids, activeId: ids[0] });
  document.querySelector('#btn-bold').click();
  await new Promise((resolve) => setTimeout(resolve, 100));
  const after = {
    text: store.doc.blocks.find((block) => block.id === 'rich_text_target')?.html ?? '',
    cell: store.doc.blocks.find((block) => block.id === 'rich_table_target')?.meta?.rows?.[0]?.[0] ?? '',
    note: store.doc.annotations.find((note) => note.id === noteId)?.html ?? '',
  };
  const bold = (html) => /<(b|strong)[\s>]/i.test(html);
  return JSON.stringify({
    beforeBold: [bold(before.text), bold(before.cell), bold(before.note)],
    afterBold: [bold(after.text), bold(after.cell), bold(after.note)],
    rich: [before.text, before.cell, before.note].every((html) => /color:|data-highlight/.test(html)),
    tableAlign: before.tableAlign,
  });
})()`));
check('多选表格/注释可加粗且可取消',
  multiRich.beforeBold.every(Boolean)
  && multiRich.afterBold.every((bold) => !bold)
  && multiRich.rich
  && multiRich.tableAlign === 'center',
  JSON.stringify(multiRich));

const sizeMenu = JSON.parse(await evaluate(`(async () => {
  const store = window.__dafeiyu.store;
  store.dispatch((doc) => [{ t: 'insertBlocks', at: doc.blocks.length, blocks: [{ id: 'size_center_test', type: 'paragraph', html: '字号居中' }] }]);
  store.setSelection({ blockIds: ['size_center_test'], activeId: 'size_center_test' });
  await new Promise((resolve) => setTimeout(resolve, 40));
  const open = async (size) => {
    store.dispatch(() => [{ t: 'patchBlock', id: 'size_center_test', patch: { fontSize: size } }]);
    document.querySelector('#font-size-menu').click();
    await new Promise((resolve) => setTimeout(resolve, 50));
    const list = document.querySelector('.size-list');
    const active = document.querySelector('.size-preset.is-on');
    const listRect = list.getBoundingClientRect();
    const itemRect = active.getBoundingClientRect();
    return {
      centered: Math.abs((itemRect.top + itemRect.height / 2) - (listRect.top + listRect.height / 2)),
      atMax: Math.abs(list.scrollTop - (list.scrollHeight - list.clientHeight)) < 1,
    };
  };
  const middle = await open(16);
  document.querySelector('#font-size-menu').click();
  await new Promise((resolve) => setTimeout(resolve, 30));
  const last = await open(160);
  document.querySelector('#font-size-menu').click();
  return JSON.stringify({ middle, last });
})()`));
check('字号菜单当前项居中', sizeMenu.middle.centered <= 2 && sizeMenu.last.atMax, JSON.stringify(sizeMenu));

const fontMixed = JSON.parse(await evaluate(`(async () => {
  const store = window.__dafeiyu.store;
  store.dispatch((doc) => [{ t: 'insertBlocks', at: doc.blocks.length, blocks: [
    { id: 'font_mixed_a', type: 'paragraph', html: 'A', fontFamily: 'MiSans' },
    { id: 'font_mixed_b', type: 'paragraph', html: 'B', fontFamily: 'LXGW WenKai' },
  ] }]);
  await new Promise((resolve) => setTimeout(resolve, 50));
  store.setSelection({ blockIds: ['font_mixed_a', 'font_mixed_b'], activeId: 'font_mixed_a' });
  await new Promise((resolve) => setTimeout(resolve, 50));
  const select = document.querySelector('#font-family');
  const mixed = select.selectedIndex;
  store.setSelection({ blockIds: ['font_mixed_a'], activeId: 'font_mixed_a' });
  await new Promise((resolve) => setTimeout(resolve, 50));
  return JSON.stringify({ mixed, single: select.value, singleIndex: select.selectedIndex });
})()`));
check('多选不同字体时字体框为空',
  fontMixed.mixed === -1 && fontMixed.single === 'MiSans' && fontMixed.singleIndex >= 0,
  JSON.stringify(fontMixed));

const fontTextSelection = JSON.parse(await evaluate(`(async () => {
  const store = window.__dafeiyu.store;
  store.dispatch((doc) => [{ t: 'insertBlocks', at: doc.blocks.length, blocks: [{
    id: 'font_text_selection', type: 'paragraph',
    html: '<span style="font-family:MiSans">MI</span><span style="font-family:&quot;LXGW WenKai&quot;">LX</span>',
  }] }]);
  await new Promise((resolve) => setTimeout(resolve, 50));
  const content = document.querySelector('[data-id="font_text_selection"] .block-content');
  const texts = [...content.querySelectorAll('span')].map((span) => span.firstChild);
  const range = document.createRange();
  range.setStart(texts[0], 0);
  range.setEnd(texts[1], texts[1].length);
  const selection = getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
  await new Promise((resolve) => setTimeout(resolve, 50));
  const select = document.querySelector('#font-family');
  const mixed = select.selectedIndex;
  const only = document.createRange();
  only.setStart(texts[0], 0);
  only.setEnd(texts[0], texts[0].length);
  selection.removeAllRanges();
  selection.addRange(only);
  await new Promise((resolve) => setTimeout(resolve, 50));
  const single = select.value;
  const singleIndex = select.selectedIndex;
  const caret = document.createRange();
  caret.setStart(texts[1], 1);
  caret.collapse(true);
  selection.removeAllRanges();
  selection.addRange(caret);
  await new Promise((resolve) => setTimeout(resolve, 50));
  const caretValue = select.value;
  const atStart = document.createRange();
  atStart.setStart(content, 0);
  atStart.collapse(true);
  selection.removeAllRanges();
  selection.addRange(atStart);
  await new Promise((resolve) => setTimeout(resolve, 50));
  const startValue = select.value;
  store.dispatch((doc) => [{ t: 'insertBlocks', at: doc.blocks.length, blocks: [{
    id: 'font_line_start', type: 'paragraph',
    html: '<span style="font-family:MiSans">AAA</span><br><span style="font-family:&quot;LXGW WenKai&quot;">BBB</span>',
  }] }]);
  await new Promise((resolve) => setTimeout(resolve, 50));
  const lineContent = document.querySelector('[data-id="font_line_start"] .block-content');
  const lineRange = document.createRange();
  lineRange.setStart(lineContent, 2);
  lineRange.collapse(true);
  selection.removeAllRanges();
  selection.addRange(lineRange);
  await new Promise((resolve) => setTimeout(resolve, 50));
  return JSON.stringify({ mixed, single, singleIndex, caret: caretValue, start: startValue, lineStart: select.value });
})()`));
check('选中不同字体的文字时字体框为空',
  fontTextSelection.mixed === -1 && fontTextSelection.single === 'MiSans' && fontTextSelection.singleIndex >= 0 && fontTextSelection.caret === 'LXGW WenKai' && fontTextSelection.start === 'MiSans' && fontTextSelection.lineStart === 'LXGW WenKai',
  JSON.stringify(fontTextSelection));

const inlineDefaultFont = JSON.parse(await evaluate(`(async () => {
  const store = window.__dafeiyu.store;
  store.dispatch((doc) => [{ t: 'insertBlocks', at: doc.blocks.length, blocks: [{
    id: 'inline_default_font', type: 'paragraph', html: '根', fontFamily: 'LXGW WenKai',
  }] }]);
  await new Promise((resolve) => setTimeout(resolve, 50));
  const content = document.querySelector('[data-id="inline_default_font"] .block-content');
  const node = content.firstChild;
  const range = document.createRange();
  range.setStart(node, 0);
  range.setEnd(node, 1);
  const selection = getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
  await new Promise((resolve) => setTimeout(resolve, 30));
  const select = document.querySelector('#font-family');
  select.value = '';
  select.dispatchEvent(new Event('change', { bubbles: true }));
  await new Promise((resolve) => setTimeout(resolve, 80));
  return JSON.stringify({
    computed: getComputedStyle(content.querySelector('span') ?? content).fontFamily,
    inline: content.querySelector('span')?.getAttribute('style') ?? '',
    block: store.doc.blocks.find((item) => item.id === 'inline_default_font')?.fontFamily ?? '',
  });
})()`));
check('选中文字切回思源黑体会覆盖区块字体',
  inlineDefaultFont.computed.includes('Source Han Sans SC')
  && inlineDefaultFont.inline.includes('Source Han Sans SC')
  && inlineDefaultFont.block === 'LXGW WenKai',
  JSON.stringify(inlineDefaultFont));

const selectionModes = JSON.parse(await evaluate(`(async () => {
  const store = window.__dafeiyu.store;
  const first = store.doc.blocks.find((block) => block.type === 'paragraph');
  const second = store.doc.blocks.find((block) => block.type === 'paragraph' && block.id !== first?.id);
  if (!first || !second) return JSON.stringify({ error: 'need two paragraphs' });
  store.setSelection({ blockIds: [first.id], activeId: first.id });
  const content = document.querySelector('[data-id="' + second.id + '"] .block-content');
  const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT);
  const text = walker.nextNode();
  if (!text) return JSON.stringify({ error: 'no text' });
  const rect = content.getBoundingClientRect();
  content.dispatchEvent(new PointerEvent('pointerdown', {
    bubbles: true, cancelable: true, button: 0, buttons: 1, pointerType: 'mouse',
    clientX: rect.left + 4, clientY: rect.top + 4,
  }));
  await new Promise((resolve) => setTimeout(resolve, 30));
  const range = document.createRange();
  range.setStart(text, 0);
  range.setEnd(text, Math.min(2, text.textContent?.length ?? 0));
  const selection = getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
  await new Promise((resolve) => setTimeout(resolve, 60));
  const afterDrag = [...store.selection.blockIds];
  content.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  await new Promise((resolve) => setTimeout(resolve, 30));
  const afterClick = [...store.selection.blockIds];
  selection.removeAllRanges();
  content.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  await new Promise((resolve) => setTimeout(resolve, 30));
  const afterPlainClick = [...store.selection.blockIds];
  store.setSelection({ blockIds: [first.id, second.id], activeId: second.id });
  content.dispatchEvent(new PointerEvent('pointerdown', {
    bubbles: true, cancelable: true, button: 0, buttons: 1, pointerType: 'mouse', ctrlKey: true,
    clientX: rect.left + 4, clientY: rect.top + 4,
  }));
  await new Promise((resolve) => setTimeout(resolve, 30));
  return JSON.stringify({ secondId: second.id, afterDrag, afterClick, afterPlainClick, ctrlKept: [...store.selection.blockIds] });
})()`));
check('文本选区切换到所属区块',
  selectionModes.afterDrag[0] === selectionModes.secondId
  && selectionModes.afterClick[0] === selectionModes.secondId
  && selectionModes.afterPlainClick.length === 1
  && selectionModes.afterPlainClick[0] === selectionModes.secondId
  && selectionModes.ctrlKept.length === 2,
  JSON.stringify(selectionModes));

const blankExit = JSON.parse(await evaluate(`(async () => {
  const store = window.__dafeiyu.store;
  const block = store.doc.blocks.find((item) => item.type === 'paragraph');
  if (!block) return JSON.stringify({ error: 'no paragraph' });
  store.setSelection({ blockIds: [block.id], activeId: block.id });
  const content = document.querySelector('[data-id="' + block.id + '"] .block-content');
  content.focus();
  const text = document.createTreeWalker(content, NodeFilter.SHOW_TEXT).nextNode();
  const range = document.createRange();
  range.setStart(text, 0);
  range.setEnd(text, Math.min(1, text.textContent?.length ?? 0));
  const selection = getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
  await new Promise((resolve) => setTimeout(resolve, 30));
  const paper = document.querySelector('#blocks');
  const rect = paper.getBoundingClientRect();
  const options = { bubbles: true, cancelable: true, button: 0, buttons: 1, pointerId: 401, pointerType: 'mouse' };
  paper.dispatchEvent(new PointerEvent('pointerdown', { ...options, clientX: rect.left + 5, clientY: rect.bottom - 5 }));
  document.dispatchEvent(new PointerEvent('pointerup', { ...options, buttons: 0, clientX: rect.left + 5, clientY: rect.bottom - 5 }));
  await new Promise((resolve) => setTimeout(resolve, 40));
  return JSON.stringify({
    ids: store.selection.blockIds.length,
    active: store.selection.activeId,
    ranges: selection.rangeCount,
    focused: document.activeElement?.closest?.('.block-content') ? true : false,
  });
})()`));
check('点击纸张空白退出编辑并清空选择',
  blankExit.ids === 0 && blankExit.active === null && blankExit.ranges === 0 && blankExit.focused === false,
  JSON.stringify(blankExit));

const escapeExit = JSON.parse(await evaluate(`(() => {
  const store = window.__dafeiyu.store;
  const block = store.doc.blocks.find((item) => item.type === 'paragraph');
  store.setSelection({ blockIds: [block.id], activeId: block.id });
  const content = document.querySelector('[data-id="' + block.id + '"] .block-content');
  content.focus();
  const text = document.createTreeWalker(content, NodeFilter.SHOW_TEXT).nextNode();
  const range = document.createRange();
  range.setStart(text, 0);
  range.setEnd(text, Math.min(1, text.textContent?.length ?? 0));
  getSelection().removeAllRanges();
  getSelection().addRange(range);
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
  return JSON.stringify({
    ids: store.selection.blockIds.length,
    active: store.selection.activeId,
    ranges: getSelection().rangeCount,
    focused: document.activeElement?.closest?.('.block-content') ? true : false,
  });
})()`));
check('Escape 退出编辑并清空选择',
  escapeExit.ids === 0 && escapeExit.active === null && escapeExit.ranges === 0 && escapeExit.focused === false,
  JSON.stringify(escapeExit));

const rightPan = JSON.parse(await evaluate(`(async () => {
  const workspace = document.querySelector('#workspace');
  const content = document.querySelector('.block-content');
  const max = Math.max(0, workspace.scrollHeight - workspace.clientHeight);
  const start = Math.min(100, max);
  workspace.scrollTop = start;
  await new Promise((resolve) => setTimeout(resolve, 20));
  const rect = workspace.getBoundingClientRect();
  const options = { bubbles: true, cancelable: true, button: 2, buttons: 2, pointerId: 501, pointerType: 'mouse' };
  workspace.dispatchEvent(new PointerEvent('pointerdown', { ...options, clientX: rect.left + 8, clientY: rect.top + 80 }));
  document.dispatchEvent(new PointerEvent('pointermove', { ...options, clientX: rect.left + 8, clientY: rect.top + 130 }));
  document.dispatchEvent(new PointerEvent('pointerup', { ...options, buttons: 0, clientX: rect.left + 8, clientY: rect.top + 130 }));
  await new Promise((resolve) => setTimeout(resolve, 30));
  const after = workspace.scrollTop;
  const menu = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: rect.left + 8, clientY: rect.top + 80 });
  workspace.dispatchEvent(menu);
  const contentBefore = workspace.scrollTop;
  content.dispatchEvent(new PointerEvent('pointerdown', { ...options, pointerId: 502, clientX: rect.left + 40, clientY: rect.top + 40 }));
  document.dispatchEvent(new PointerEvent('pointermove', { ...options, pointerId: 502, clientX: rect.left + 40, clientY: rect.top + 90 }));
  document.dispatchEvent(new PointerEvent('pointerup', { ...options, pointerId: 502, buttons: 0, clientX: rect.left + 40, clientY: rect.top + 90 }));
  await new Promise((resolve) => setTimeout(resolve, 20));
  return JSON.stringify({
    start,
    after,
    expected: Math.max(0, start - 50),
    menuPrevented: menu.defaultPrevented,
    contentStable: workspace.scrollTop === contentBefore,
  });
})()`));
check('空白处右键拖动平移正文且不影响区块',
  rightPan.start > 0
  && rightPan.after === rightPan.expected
  && rightPan.menuPrevented === true
  && rightPan.contentStable === true,
  JSON.stringify(rightPan));

const sideMarquee = JSON.parse(await evaluate(`(async () => {
  const store = window.__dafeiyu.store;
  const workspace = document.querySelector('#workspace');
  const paper = document.querySelector('#blocks');
  const block = document.querySelector('.block');
  if (!block) return JSON.stringify({ error: 'no block' });
  const ws = workspace.getBoundingClientRect();
  const page = paper.getBoundingClientRect();
  const target = block.getBoundingClientRect();
  const startX = ws.left + Math.max(6, (page.left - ws.left) / 2);
  const startY = target.top + Math.min(12, target.height / 2);
  const endX = target.left + Math.min(30, target.width / 2);
  const endY = target.top + Math.min(30, target.height / 2);
  const options = { bubbles: true, cancelable: true, button: 0, buttons: 1, pointerId: 601, pointerType: 'mouse' };
  workspace.dispatchEvent(new PointerEvent('pointerdown', { ...options, clientX: startX, clientY: startY }));
  document.dispatchEvent(new PointerEvent('pointermove', { ...options, clientX: endX, clientY: endY }));
  document.dispatchEvent(new PointerEvent('pointerup', { ...options, buttons: 0, clientX: endX, clientY: endY }));
  await new Promise((resolve) => setTimeout(resolve, 40));
  return JSON.stringify({ selected: store.selection.blockIds.length, target: block.dataset.id, contains: store.selection.blockIds.includes(block.dataset.id) });
})()`));
check('从左右空白拖入正文可以框选区块',
  sideMarquee.selected > 0 && sideMarquee.contains === true,
  JSON.stringify(sideMarquee));

const clipboardFlow = JSON.parse(await evaluate(`(async () => {
  const store = window.__dafeiyu.store;
  const actions = window.__dafeiyu.actions;
  const waitClipboard = async (count, firstHtml) => {
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const html = await window.moye.readClipboardHtml();
      const marker = html.match(/data-dafeiyu-blocks="([^"]+)"/)?.[1];
      if (marker) {
        try {
          const payload = JSON.parse(decodeURIComponent(marker));
          if ((payload.blocks?.length ?? 0) === count && payload.blocks?.[0]?.html === firstHtml) return;
        } catch {
          /* 等待下一次写入 */
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  };
  const sources = store.doc.blocks.filter((block) => block.type === 'paragraph' && block.html.trim()).slice(0, 2);
  if (sources.length < 2) return JSON.stringify({ error: 'need two paragraphs' });
  store.dispatch((doc) => [{ t: 'insertBlocks', at: doc.blocks.length, blocks: [{ id: 'clip_flow_target', type: 'paragraph', html: '' }] }]);
  await new Promise((resolve) => setTimeout(resolve, 30));
  store.setSelection({ blockIds: sources.map((block) => block.id), activeId: sources[1].id });
  await actions.copy();
  await waitClipboard(2, sources[0].html);
  const beforeMulti = store.doc.blocks.length;
  store.setSelection({ blockIds: ['clip_flow_target'], activeId: 'clip_flow_target' });
  await actions.paste();
  await new Promise((resolve) => setTimeout(resolve, 30));
  const targetAfterMulti = store.doc.blocks.find((block) => block.id === 'clip_flow_target');
  const caretAtEnd = () => {
    const content = document.querySelector('[data-id="clip_flow_target"] .block-content');
    const selection = getSelection();
    if (!content || !selection?.rangeCount || !selection.isCollapsed) return false;
    const range = selection.getRangeAt(0);
    const before = document.createRange();
    before.selectNodeContents(content);
    try { before.setEnd(range.startContainer, range.startOffset); } catch { return false; }
    return before.toString().length === (content.textContent?.length ?? 0);
  };
  const multi = {
    before: beforeMulti,
    after: store.doc.blocks.length,
    targetHtml: targetAfterMulti?.html ?? '',
    targetText: document.querySelector('[data-id="clip_flow_target"] .block-content')?.textContent ?? '',
    targetSelected: document.querySelector('[data-id="clip_flow_target"]')?.classList.contains('is-selected') ?? false,
    caretEnd: caretAtEnd(),
    selected: store.selection.blockIds.length,
  };
  store.undo();
  await new Promise((resolve) => setTimeout(resolve, 20));
  const targetAfterUndo = store.doc.blocks.find((block) => block.id === 'clip_flow_target');
  const beforeSingle = store.doc.blocks.length;
  store.setSelection({ blockIds: [sources[0].id], activeId: sources[0].id });
  await actions.copy();
  await waitClipboard(1, sources[0].html);
  store.setSelection({ blockIds: ['clip_flow_target'], activeId: 'clip_flow_target' });
  await actions.paste();
  await new Promise((resolve) => setTimeout(resolve, 20));
  const targetAfterSingle = store.doc.blocks.find((block) => block.id === 'clip_flow_target');
  const single = {
    before: beforeSingle,
    after: store.doc.blocks.length,
    targetHtml: targetAfterSingle?.html ?? '',
    targetText: document.querySelector('[data-id="clip_flow_target"] .block-content')?.textContent ?? '',
    targetSelected: document.querySelector('[data-id="clip_flow_target"]')?.classList.contains('is-selected') ?? false,
    caretEnd: caretAtEnd(),
  };
  store.undo();
  return JSON.stringify({ multi, single, undoHtml: targetAfterUndo?.html ?? null });
})()`));
check('区块剪贴板：多选复制、单选粘贴、空块原地替换',
  clipboardFlow.multi.after === clipboardFlow.multi.before + 1
  && clipboardFlow.multi.targetHtml !== '' && clipboardFlow.multi.targetText !== '' && clipboardFlow.multi.caretEnd === true
  && clipboardFlow.multi.targetSelected === true
  && clipboardFlow.multi.selected === 2
  && clipboardFlow.single.after === clipboardFlow.single.before
  && clipboardFlow.single.targetHtml !== '' && clipboardFlow.single.targetText !== '' && clipboardFlow.single.caretEnd === true
  && clipboardFlow.single.targetSelected === true
  && clipboardFlow.undoHtml === '',
  JSON.stringify(clipboardFlow));

const asyncCopy = JSON.parse(await evaluate(`(async () => {
  const store = window.__dafeiyu.store;
  const actions = window.__dafeiyu.actions;
  const source = store.doc.blocks.find((block) => block.type === 'paragraph' && block.html.trim());
  if (!source) return JSON.stringify({ error: 'no source' });
  store.dispatch((doc) => [{ t: 'insertBlocks', at: doc.blocks.length, blocks: [{ id: 'async_copy_target', type: 'paragraph', html: '' }] }]);
  await new Promise((resolve) => setTimeout(resolve, 20));
  store.setSelection({ blockIds: [source.id], activeId: source.id });
  const copy = actions.copy();
  store.setSelection({ blockIds: ['async_copy_target'], activeId: 'async_copy_target' });
  await actions.paste();
  await copy;
  await new Promise((resolve) => setTimeout(resolve, 20));
  const target = store.doc.blocks.find((block) => block.id === 'async_copy_target');
  return JSON.stringify({ targetHtml: target?.html ?? '', count: store.doc.blocks.length });
})()`));
check('复制未完成时立即粘贴会等待写入',
  asyncCopy.targetHtml !== '',
  JSON.stringify(asyncCopy));

finish();
