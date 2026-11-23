/** 真实鼠标交互：颜色面板、自定义颜色点击与拖动。 */

import { command, evaluate, check, finish, sleep } from './smoke/harness.mjs';

for (let i = 0; i < 30; i += 1) {
  if (await evaluate('Boolean(window.__dafeiyu?.ready)')) break;
  await sleep(200);
}

async function clickSelector(selector) {
  const rect = await evaluate(`document.querySelector('${selector}').getBoundingClientRect().toJSON()`);
  const x = rect.x + rect.width / 2;
  const y = rect.y + rect.height / 2;
  await command('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
  await command('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
  await command('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
  await sleep(100);
}

async function prepareSelection(html, query) {
  return JSON.parse(await evaluate(`(() => {
    const store = window.__dafeiyu.store;
    const blockId = store.doc.blocks[0]?.id;
    if (!blockId) return JSON.stringify({ error: 'no block' });
    store.dispatch(() => [{ t: 'patchBlock', id: blockId, patch: { html: ${JSON.stringify(html)} } }]);
    const content = document.querySelector('[data-id="' + blockId + '"] .block-content');
    const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT);
    const nodes = [];
    let node;
    let full = '';
    while ((node = walker.nextNode())) {
      nodes.push({ node, start: full.length });
      full += node.data;
    }
    const start = full.indexOf(${JSON.stringify(query)});
    if (start < 0) return JSON.stringify({ error: 'query not found', blockId });
    const end = start + ${JSON.stringify(query)}.length;
    const at = (index) => nodes.find((item) => index < item.start + item.node.data.length) || nodes[nodes.length - 1];
    const from = at(start);
    const to = at(end);
    const range = document.createRange();
    range.setStart(from.node, start - from.start);
    range.setEnd(to.node, end - to.start);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    return JSON.stringify({ selected: selection.toString(), blockId });
  })()`));
}

const partial = await prepareSelection('AAA BBB <span style="color:#c00000">CC</span> DDD', 'AAA BBB C');
await clickSelector('#btn-text-color-more');
await clickSelector('#text-color-palette [data-color="#9CA3AF"]');
await clickSelector('#btn-text-color-apply');
const partialColor = await evaluate(`(() => {
  const content = document.querySelector('[data-id="${partial.blockId}"] .block-content');
  const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT);
  let node;
  let target;
  while ((node = walker.nextNode())) {
    if (node.data === 'C') { target = node; break; }
  }
  return target ? getComputedStyle(target.parentElement).color : '';
})()`);
check('real mouse: partial color overrides old color', partial.selected === 'AAA BBB C' && partialColor === 'rgb(156, 163, 175)', JSON.stringify({ partial, partialColor }));

await evaluate(`localStorage.setItem('dafeiyu-next.custom-colors', JSON.stringify(['#BFDBFE'])); location.reload();`);
await sleep(1600);
for (let i = 0; i < 30; i += 1) {
  if (await evaluate('Boolean(window.__dafeiyu?.ready)')) break;
  await sleep(200);
}
const customSelected = await prepareSelection('AAA <span style="color:#c00000">BBB</span> CCC', 'AAA B');
await clickSelector('#btn-text-color-more');
await clickSelector('#text-color-palette [data-color="#BFDBFE"]');
const customState = JSON.parse(await evaluate(`JSON.stringify({
  selected: window.getSelection()?.toString() ?? '',
  color: document.querySelector('#text-color')?.value ?? '',
})`));
check('real mouse: custom swatch keeps selection', customSelected.selected === 'AAA B' && customState.selected === 'AAA B' && customState.color === '#bfdbfe', JSON.stringify(customState));

await evaluate(`localStorage.setItem('dafeiyu-next.custom-colors', JSON.stringify(['#123456', '#654321'])); location.reload();`);
await sleep(1600);
for (let i = 0; i < 30; i += 1) {
  if (await evaluate('Boolean(window.__dafeiyu?.ready)')) break;
  await sleep(200);
}
await clickSelector('#btn-text-color-more');
const drag = JSON.parse(await evaluate(`(() => {
  const custom = [...document.querySelectorAll('#text-color-palette [data-custom="1"]')];
  const first = custom[0].getBoundingClientRect();
  const second = custom[1].getBoundingClientRect();
  return JSON.stringify({
    from: { x: first.left + 4, y: first.top + 4 },
    to: { x: second.right - 1, y: second.top + 4 },
  });
})()`));
await command('Input.dispatchMouseEvent', { type: 'mouseMoved', x: drag.from.x, y: drag.from.y });
await command('Input.dispatchMouseEvent', { type: 'mousePressed', x: drag.from.x, y: drag.from.y, button: 'left', clickCount: 1 });
await command('Input.dispatchMouseEvent', { type: 'mouseMoved', x: drag.to.x, y: drag.to.y, button: 'left', buttons: 1 });
await command('Input.dispatchMouseEvent', { type: 'mouseReleased', x: drag.to.x, y: drag.to.y, button: 'left', clickCount: 1 });
await sleep(160);
const order = JSON.parse(await evaluate(`JSON.stringify([...document.querySelectorAll('#text-color-palette [data-custom="1"]')].map((item) => item.dataset.color))`));
check('real mouse: custom swatch drag reorder', order[0] === '#654321' && order[1] === '#123456', JSON.stringify(order));

await evaluate(`document.querySelectorAll('.style-panel').forEach((panel) => { panel.hidden = true; })`);
const rerender = await prepareSelection('SNAPSHOT_TEXT', 'SNAPSHOT_TEXT');
await clickSelector('#btn-text-color-more');
await evaluate(`(() => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); window.__dafeiyu.store.dispatch(() => [{ t: 'patchBlock', id: '${rerender.blockId}', patch: { html: 'SNAPSHOT_TEXT!' } }]); })()`);
await sleep(80);
await clickSelector('#text-color-palette [data-color="#9CA3AF"]');
await clickSelector('#btn-text-color-apply');
const rerenderColor = await evaluate(`(() => {
  const content = document.querySelector('[data-id="${rerender.blockId}"] .block-content');
  return content.innerHTML.includes('127, 127, 127') ? 'gray' : content.innerHTML;
})()`);
check('real mouse: selection survives rerender', rerender.selected === 'SNAPSHOT_TEXT' && rerenderColor === 'gray', JSON.stringify({ rerender, rerenderColor }));

finish();
