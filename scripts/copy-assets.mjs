import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const from = join(root, '..', 'src', 'renderer');
const to = join(root, '..', 'dist', 'renderer');

await mkdir(to, { recursive: true });
await cp(join(from, 'index.html'), join(to, 'index.html'));
await cp(join(from, 'fonts'), join(to, 'fonts'), { recursive: true });
await cp(join(from, 'assets'), join(to, 'assets'), { recursive: true });

const cssFiles = ['base.css', 'editor.css', 'panels.css', 'mark.css', 'toolbar.css', 'color-palette.css', 'comments.css', 'table.css', 'about.css'];
const css = await Promise.all(cssFiles.map((file) => readFile(join(from, 'styles', file), 'utf8')));
await writeFile(join(to, 'styles.css'), css.join('\n'));
console.log('assets copied → dist/renderer');
