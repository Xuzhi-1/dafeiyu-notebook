/**
 * 插件自检：用 Node 直接加载插件脚本，跑 activate 并输出结果。
 * 用法：npm run plugin:check -- <插件目录>
 * 不需要打开 Electron，AI / 用户都能用它确认插件是否可加载。
 */
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const dir = process.argv[2];
if (!dir) {
  console.error('用法：node scripts/plugin-check.mjs <插件目录>');
  process.exit(2);
}

const manifestPath = path.join(dir, 'plugin.json');
let manifest;
try {
  manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
} catch (error) {
  console.log(JSON.stringify({ ok: false, stage: 'manifest', error: String(error.message ?? error) }));
  process.exit(1);
}

const commands = [];
const slots = [];
const api = {
  id: manifest.id,
  name: manifest.name,
  version: manifest.version,
  toast: () => {},
  commands: { register: (command) => commands.push({ id: command.id, title: command.title }) },
  ui: { slot: (name) => slots.push(name) },
  editor: { getText: () => '', getActiveBlockText: () => '', getBlockCount: () => 0, insertText: () => {} },
  doc: { getTitle: () => '' },
  storage: { get: () => null, set: () => {}, remove: () => {} },
};

try {
  const mainPath = path.join(dir, manifest.main || 'main.js');
  const module = await import(pathToFileURL(mainPath).href);
  if (typeof module.activate !== 'function') throw new Error('插件没有导出 activate(api)');
  await module.activate(api);
  console.log(JSON.stringify({ ok: true, id: manifest.id, name: manifest.name, commands, slots }));
} catch (error) {
  console.log(JSON.stringify({ ok: false, stage: 'activate', error: String(error.message ?? error) }));
  process.exit(1);
}
