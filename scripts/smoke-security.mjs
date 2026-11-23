/** 安全回归：IPC 路径白名单与导入 HTML 清洗。 */

import { check, evaluate, finish, sleep } from './smoke/harness.mjs';

for (let i = 0; i < 30; i += 1) {
  if (await evaluate('Boolean(window.__dafeiyu?.ready)')) break;
  await sleep(200);
}

const pathGuard = JSON.parse(await evaluate(`(async () => {
  try {
    await window.moye.readPath('C:/Windows/win.ini');
    return JSON.stringify({ blocked: false });
  } catch {
    return JSON.stringify({ blocked: true });
  }
})()`));
check('未授权文件路径被拒绝读取', pathGuard.blocked === true, JSON.stringify(pathGuard));

const sanitize = JSON.parse(await evaluate(`(() => {
  const handle = window.__dafeiyu;
  const blockId = handle.store.doc.blocks[0].id;
  handle.store.dispatch(() => [{
    t: 'patchBlock',
    id: blockId,
    patch: { html: '<span style="position:fixed;color:#c00000">X</span><a href="javascript:alert(1)">link</a>' },
  }]);
  const content = document.querySelector('[data-id="' + blockId + '"] .block-content');
  const span = content.querySelector('span');
  const link = content.querySelector('a');
  return JSON.stringify({
    color: span ? span.style.color : '',
    position: span ? span.style.position : '',
    href: link ? link.getAttribute('href') : null,
  });
})()`));
check('导入 HTML 的 style/href 被白名单清洗', sanitize.color === 'rgb(192, 0, 0)' && sanitize.position === '' && sanitize.href === null, JSON.stringify(sanitize));

finish();
