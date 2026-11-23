/** 系统与布局检查：窗口状态、工具栏同排垂直对齐。 */

import { evaluate, check, finish, sleep } from './smoke/harness.mjs';

for (let i = 0; i < 30; i += 1) {
  if (await evaluate('Boolean(window.__dafeiyu?.ready)')) break;
  await sleep(200);
}

const windowInfo = JSON.parse(await evaluate(
  `window.moye.info().then((info) => JSON.stringify({ bounds: info.bounds, userData: info.userData }))`,
));
check(
  '窗口大小/位置被记住（R15）',
  Boolean(windowInfo.bounds)
    && Math.abs(windowInfo.bounds.width - 1200) <= 60
    && Math.abs(windowInfo.bounds.height - 820) <= 60,
  JSON.stringify(windowInfo),
);

const toolbarCenters = JSON.parse(await evaluate(`(() => {
  const selectors = ['#btn-file', '#btn-save', '#btn-outline', '#btn-undo', '#btn-redo', '#btn-add', '#font-family-button', '#font-size-input', '#btn-bold', '#btn-text-color', '#btn-mark', '#btn-comment'];
  const centers = selectors.map((selector) => {
    const rect = document.querySelector(selector).getBoundingClientRect();
    return { selector, top: Number(rect.top.toFixed(2)), center: Number(((rect.top + rect.bottom) / 2).toFixed(2)) };
  });
  const firstTop = centers[0].top;
  const firstRow = centers.filter((item) => item.top === firstTop);
  const aligned = firstRow.every((item) => item.center === firstRow[0].center);
  return JSON.stringify({ centers, aligned, firstRowCount: firstRow.length });
})()`));
check('工具栏同排控件垂直居中', toolbarCenters.aligned && toolbarCenters.firstRowCount >= 8, JSON.stringify(toolbarCenters));

finish();
