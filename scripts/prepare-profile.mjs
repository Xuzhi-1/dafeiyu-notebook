/**
 * 准备冒烟用的干净用户目录（窗口状态 + 一个用户插件）。
 * 用法：node scripts/prepare-profile.mjs [目录]
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const dir = path.resolve(process.argv[2] || '../_profile-smoke');
rmSync(dir, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 });
mkdirSync(path.join(dir, 'plugins', 'user-extra'), { recursive: true });
writeFileSync(
  path.join(dir, 'window-state.json'),
  JSON.stringify({ bounds: { x: 80, y: 60, width: 1200, height: 820 } }),
  'utf8',
);
writeFileSync(
  path.join(dir, 'plugins', 'user-extra', 'plugin.json'),
  JSON.stringify({ id: 'user-extra', name: '用户插件', version: '1.0.0', main: 'main.js' }),
  'utf8',
);
writeFileSync(
  path.join(dir, 'plugins', 'user-extra', 'main.js'),
  'export function activate(api) { api.commands.register({ title: "插入日期", run() { api.editor.insertText("2026-11-19"); } }); }\n',
  'utf8',
);
console.log('profile ready in', dir);
