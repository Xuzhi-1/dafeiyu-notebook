import { describe, expect, it } from 'vitest';
import { createDoc } from '../src/core/doc.js';
import { createBlock } from '../src/core/types.js';
import type { Doc } from '../src/core/types.js';
import { countDocumentContent } from '../src/core/textStats.js';

function docWith(overrides: Partial<Doc>): Doc {
  return { ...createDoc(), ...overrides };
}

describe('文档内容量', () => {
  it('统计正文、注释、表格已填写单元格和图表', () => {
    const text = { ...createBlock('paragraph', '你好 world 123') };
    const table = {
      ...createBlock('table'),
      meta: { rows: [['A', ''], ['中文', 'x']], header: true, richText: true },
    };
    const chart = { ...createBlock('chart') };
    const doc = docWith({
      blocks: [text, { ...createBlock('image') }, table, chart],
      annotations: [{
        id: 'n1',
        type: 'comment',
        anchor: { blockId: text.id, blockIds: [text.id, table.id, chart.id] },
        html: '评论 test 2',
      }],
    });
    // 4 正文 + 4 注释 + 3 个已填表格 + 1 个图表
    expect(countDocumentContent(doc)).toBe(12);
  });

  it('跳过空单元格和被合并覆盖的单元格', () => {
    const table = {
      ...createBlock('table'),
      meta: {
        rows: [['合并', '覆盖'], ['', '']],
        spans: [[{ rowSpan: 1, colSpan: 1 }, null], [null, null]],
        richText: true,
      },
    };
    expect(countDocumentContent(docWith({ blocks: [table] }))).toBe(1);
  });

  it('只统计文字，不计空格标点', () => {
    const doc = docWith({
      blocks: [
        { ...createBlock('paragraph', '你好，世界。') },
        { ...createBlock('paragraph', 'hello, world!') },
        { ...createBlock('paragraph', 'A1 B2') },
      ],
    });
    expect(countDocumentContent(doc)).toBe(8);
  });
});
