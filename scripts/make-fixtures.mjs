/**
 * 生成冒烟用测试数据：一个 docx + 一张 1x1 PNG。
 * 用法：node scripts/make-fixtures.mjs [输出目录]
 */
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const HTMLtoDOCX = require('html-to-docx');
const dir = process.argv[2] || '..';

const html = `<!doctype html><html><head><meta charset="utf-8"></head><body>
<h1>导入测试标题</h1>
<p>这是一段导入正文，包含 <b>加粗</b> 文字。</p>
<ul><li>项目一</li><li>项目二</li></ul>
<table border="1"><tr><th>甲</th><th>乙</th></tr><tr><td>1</td><td>2</td></tr></table>
</body></html>`;

const buffer = await HTMLtoDOCX(html, null, {
  margins: { top: 1440, right: 1440, bottom: 1440, left: 1440, header: 720, footer: 720, gutter: 0 },
  font: 'Microsoft YaHei',
  fontSize: 22,
});
writeFileSync(path.join(dir, '_import_test.docx'), buffer);
writeFileSync(
  path.join(dir, '_test_image.png'),
  Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'),
);
const fixtureBlocks = Array.from({ length: 124 }, (_, index) => ({
  id: `fixture_${index + 1}`,
  type: 'p',
  html: index === 0 ? '洛斯里克与余灰，测试文档。' : `测试段落 ${index + 1}`,
}));
const fixtureDoc = {
  title: '无标题文档',
  blocks: fixtureBlocks,
  toc: [
    { id: 'fixture_toc_1', blockId: 'fixture_1', blockIds: [], label: '测试目录', parentId: null, level: 1 },
    { id: 'fixture_toc_2', blockId: 'fixture_2', blockIds: [], label: '第二项', parentId: null, level: 1 },
  ],
  groups: [],
  comments: [],
};
writeFileSync(path.join(dir, '_open_test.dfy'), JSON.stringify(fixtureDoc, null, 2), 'utf8');

console.log('fixtures ready in', path.resolve(dir));
