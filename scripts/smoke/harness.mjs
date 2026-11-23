/** 冒烟测试共用的 CDP 连接与断言工具。 */

const base = process.env.DAFEIYU_DEBUG_URL || 'http://127.0.0.1:9333';

const list = await (await fetch(`${base}/json/list`)).json();
const page = list.find((item) => item.type === 'page');
if (!page) throw new Error('没有找到页面，确认应用已带 --remote-debugging-port 启动');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });

let seq = 0;
const pending = new Map();
ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg);
    pending.delete(msg.id);
  }
};

export const evaluate = (expression) => new Promise((resolve) => {
  const id = ++seq;
  pending.set(id, resolve);
  ws.send(JSON.stringify({
    id,
    method: 'Runtime.evaluate',
    params: { expression, returnByValue: true, awaitPromise: true },
  }));
}).then((msg) => {
  if (msg.result?.exceptionDetails) {
    throw new Error(msg.result.exceptionDetails.exception?.description || 'eval failed');
  }
  return msg.result?.result?.value;
});

export const command = (method, params = {}) => new Promise((resolve) => {
  const id = ++seq;
  pending.set(id, resolve);
  ws.send(JSON.stringify({ id, method, params }));
});

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function waitFor(expression, timeout = 5000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const value = await evaluate(expression);
    if (value) return value;
    await sleep(50);
  }
  throw new Error(`waitFor timeout: ${expression}`);
}

export const results = [];

export const check = (name, pass, detail = '') => {
  results.push({ name, pass });
  console.log(`[${pass ? 'PASS' : 'FAIL'}] ${name}${detail ? '  ' + detail : ''}`);
};

export async function click(selector) {
  await evaluate(`document.querySelector('${selector}')?.scrollIntoView({ block: 'center' })`);
  await sleep(20);
  const rect = await evaluate(`document.querySelector('${selector}').getBoundingClientRect().toJSON()`);
  const x = rect.x + rect.width / 2;
  const y = rect.y + rect.height / 2;
  await command('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
  await command('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
  await command('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
  await sleep(80);
}

export function finish() {
  ws.close();
  const failed = results.filter((item) => !item.pass).length;
  if (results.length) console.log(`\n${results.length - failed}/${results.length} 通过`);
  if (failed) process.exitCode = 1;
  return { total: results.length, failed };
}
