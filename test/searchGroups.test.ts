import { describe, expect, it } from 'vitest';
import type { Doc } from '../src/core/types.js';
import { defaultMark } from '../src/core/notes.js';
import { createDoc } from '../src/core/doc.js';
import { createBlock } from '../src/core/types.js';
import { buildSearchGroups } from '../src/ui/searchGroups.js';
import type { SearchCommentPort, SearchHit } from '../src/core/search.js';

describe('搜索分组', () => {
  const doc: Doc = {
    ...createDoc('搜索'),
    blocks: ['a', 'b', 'c'].map((id) => ({ ...createBlock('paragraph'), id, html: id })),
    annotations: [
      { id: 'mg', type: 'mark', anchor: { blockId: 'a', blockIds: ['a', 'b', 'c'] }, mark: defaultMark('mark') },
      { id: 'cg', type: 'comment', anchor: { blockId: 'b', blockIds: ['b', 'c'] }, html: '', color: '#0070c0' },
    ],
  };
  const hits: SearchHit[] = ['a', 'b', 'c'].map((id, index) => ({
    blockId: id,
    kind: 'text',
    index: 0,
    snippet: id,
  }));
  const comments: SearchCommentPort = {
    render: () => '',
    groupForBlock: (_doc, id) => id === 'b' || id === 'c' ? { id: 'cg', color: '#0070c0' } : undefined,
  };

  it('组标记和组注释各自生成分组轨道', () => {
    const groups = buildSearchGroups(doc, hits, comments);
    expect(groups.markFirst.get('group:mg')).toBe(0);
    expect(groups.markRails).toEqual([{ first: 0, last: 2, color: defaultMark('mark').color }]);
    expect(groups.commentMeta.get('a')).toBeUndefined();
    expect(groups.commentMeta.get('b')?.id).toBe('cg');
    expect(groups.commentMarker.get('cg')).toBeUndefined();
    expect(groups.commentRails).toEqual([{ first: 1, last: 2, color: '#0070c0' }]);
  });

  it('类型图标只记录表格与图表的第一条', () => {
    const tableHits: SearchHit[] = [
      { blockId: 't', cell: { row: 0, column: 0 }, kind: 'text', index: 0, snippet: 'x' },
      { blockId: 't', cell: { row: 1, column: 0 }, kind: 'text', index: 0, snippet: 'y' },
      { blockId: 'c', kind: 'chart', index: 0, snippet: 'z' },
    ];
    const groups = buildSearchGroups(doc, tableHits, comments);
    expect(groups.typeFirst.get('table:t')).toBe(0);
    expect(groups.typeFirst.get('chart:c')).toBe(2);
    expect(groups.typeRails).toEqual([{ first: 0, last: 1 }]);
  });

  it('表格与图表的多条命中生成类型轨道', () => {
    const chartHits: SearchHit[] = [
      { blockId: 'c', kind: 'chart', index: 0, snippet: 'x' },
      { blockId: 'c', kind: 'chart', index: 1, snippet: 'y' },
    ];
    const groups = buildSearchGroups(doc, chartHits, comments);
    expect(groups.typeFirst.get('chart:c')).toBe(0);
    expect(groups.typeRails).toEqual([{ first: 0, last: 1 }]);
  });
  it('note hits do not extend group mark rails', () => {
    const mixed: SearchHit[] = [
      hits[1],
      hits[2],
      { blockId: 'c', noteId: 'cg', kind: 'note', index: 0, snippet: 'note' },
    ];
    const groups = buildSearchGroups(doc, mixed, comments);
    expect(groups.markRails).toEqual([{ first: 0, last: 1, color: defaultMark('mark').color }]);
    expect(groups.commentMarker.get('cg')).toBe(2);
  });

});
