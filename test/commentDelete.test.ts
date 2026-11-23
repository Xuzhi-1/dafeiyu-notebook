import { describe, expect, it } from 'vitest';
import { createDoc } from '../src/core/doc.js';
import { applyOps } from '../src/core/ops.js';
import { removeNotesOp } from '../src/core/notes.js';
import type { Doc } from '../src/core/types.js';

function docWithNotes(): Doc {
  const base = createDoc();
  return {
    ...base,
    annotations: [
      { id: 'n1', type: 'comment', anchor: { blockId: base.blocks[0].id }, html: '1' },
      { id: 'n2', type: 'comment', anchor: { blockId: base.blocks[0].id }, html: '2' },
      { id: 'n3', type: 'comment', anchor: { blockId: base.blocks[0].id }, html: '3' },
    ],
  };
}

describe('removeNotesOp', () => {
  it('removes multiple comments in one operation', () => {
    const doc = docWithNotes();
    const ops = removeNotesOp(doc, ['n1', 'n3']);
    expect(ops).not.toBeNull();
    const next = applyOps(doc, ops ?? []);
    expect(next.annotations.map((annotation) => annotation.id)).toEqual(['n2']);
  });

  it('returns null when nothing matches', () => {
    expect(removeNotesOp(docWithNotes(), [])).toBeNull();
    expect(removeNotesOp(docWithNotes(), ['missing'])).toBeNull();
  });
});
