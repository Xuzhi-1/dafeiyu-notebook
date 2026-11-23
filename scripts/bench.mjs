/** 独立性能基准：不参与功能冒烟，避免机器波动导致主测试失败。 */

import { evaluate, finish } from './smoke/harness.mjs';

for (let i = 0; i < 20; i += 1) {
  if (await evaluate('Boolean(window.__dafeiyu?.ready)')) break;
  await new Promise((resolve) => setTimeout(resolve, 300));
}

const runs = [];
for (let i = 0; i < 3; i += 1) {
  runs.push(JSON.parse(await evaluate(`(() => {
    const handle = window.__dafeiyu;
    const result = handle.loadPerfDoc(3000);
    const started = performance.now();
    handle.store.dispatch(() => [{ t: 'patchBlock', id: 'perf_1500', patch: { html: '只改这一块' } }]);
    return JSON.stringify({
      renderMs: result.renderMs,
      patchMs: Math.round(performance.now() - started),
      updated: handle.lastStats.updated,
    });
  })()`)));
}

const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const renderMs = median(runs.map((run) => run.renderMs));
const patchMs = median(runs.map((run) => run.patchMs));
console.log(JSON.stringify({ runs, median: { renderMs, patchMs } }, null, 2));
console.log(`3000 块：渲染 ${renderMs}ms，单块修改 ${patchMs}ms`);
if (renderMs > 100 || patchMs > 30) process.exitCode = 1;
finish();
