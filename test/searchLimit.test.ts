import { describe, expect, it } from 'vitest';
import { createDoc } from '../src/core/doc.js';
import { createBlock } from '../src/core/types.js';
import { searchDoc } from '../src/core/search.js';

describe('searchDoc limit', () => {
  const table = {
    ...createBlock('table'),
    meta: { rows: [['2', '2'], ['2', '2']], header: true, richText: true },
  };
  const doc = { ...createDoc(), blocks: [table] };

  it('applies the limit inside a table', () => {
    expect(searchDoc(doc, '2', 2)).toHaveLength(2);
    expect(searchDoc(doc, '2', 3)).toHaveLength(3);
  });

  it('returns no hits for a non-positive limit', () => {
    expect(searchDoc(doc, '2', 0)).toEqual([]);
    expect(searchDoc(doc, '2', -1)).toEqual([]);
  });
});
