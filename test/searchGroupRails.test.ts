import { describe, expect, it } from 'vitest';
import type { Doc } from '../src/core/types.js';
import { createDoc } from '../src/core/doc.js';
import { createBlock } from '../src/core/types.js';
import { buildSearchGroups } from '../src/ui/searchGroups.js';
import type { SearchCommentPort, SearchHit } from '../src/core/search.js';

describe('group comment search rails', () => {
  const doc: Doc = {
    ...createDoc('search'),
    blocks: ['a', 'b', 'c'].map((id) => ({ ...createBlock('paragraph'), id, html: id })),
    annotations: [
      { id: 'cg', type: 'comment', anchor: { blockId: 'b', blockIds: ['b', 'c'] }, html: '', color: '#0070c0' },
    ],
  };
  const hits: SearchHit[] = ['a', 'b', 'c'].map((id) => ({
    blockId: id,
    kind: 'text',
    index: 0,
    snippet: id,
  }));
  const comments: SearchCommentPort = {
    render: () => '',
    groupForBlock: (_doc, id) => id === 'b' || id === 'c' ? { id: 'cg', color: '#0070c0' } : undefined,
  };

  it('draws a rail for a single group hit', () => {
    const groups = buildSearchGroups(doc, [hits[1]], comments);
    expect(groups.commentMarker.get('cg')).toBeUndefined();
    expect(groups.commentRails).toEqual([{ first: 0, last: 0, color: '#0070c0' }]);
  });

  it('keeps comment hits out of the block range rail', () => {
    const noteHits: SearchHit[] = [
      { blockId: 'b', noteId: 'cg', kind: 'note', index: 0, snippet: 'x' },
      { blockId: 'c', kind: 'text', index: 0, snippet: 'y' },
    ];
    const groups = buildSearchGroups(doc, noteHits, comments);
    expect(groups.commentMarker.get('cg')).toBe(0);
    expect(groups.commentRails).toEqual([{ first: 1, last: 1, color: '#0070c0' }]);
  });

  it('does not draw a block range for a comment-only group hit', () => {
    const groups = buildSearchGroups(doc, [
      { blockId: 'b', noteId: 'cg', kind: 'note', index: 0, snippet: 'x' },
    ], comments);
    expect(groups.commentMarker.get('cg')).toBe(0);
    expect(groups.commentRails).toEqual([]);
  });

  it('keeps one rail across an interleaved comment row', () => {
    const mixed: SearchHit[] = [
      { blockId: 'b', kind: 'text', index: 0, snippet: 'x' },
      { blockId: 'c', noteId: 'cg', kind: 'note', index: 0, snippet: 'y' },
      { blockId: 'c', kind: 'text', index: 0, snippet: 'z' },
    ];
    const groups = buildSearchGroups(doc, mixed, comments);
    expect(groups.commentMarker.get('cg')).toBe(1);
    expect(groups.commentRails).toEqual([{ first: 0, last: 2, color: '#0070c0' }]);
  });
});
