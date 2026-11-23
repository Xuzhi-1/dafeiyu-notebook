import { describe, expect, it } from 'vitest';
import { applyOps } from '../src/core/ops';
import { resolveBlockPlacement } from '../src/core/blockPlacement';
import { createBlockInsertionPlan } from '../src/core/blockInsertion';
import { diffDocs } from '../src/core/diff';
import { buildOutline } from '../src/core/decorate';
import { docFromRaw, createDoc, docToV2 } from '../src/core/doc';
import { addEntry, addEntryAt, moveEntries, moveEntriesToEnd, moveEntry, moveEntryToEnd, removeEntries, removeEntry, renameEntry, toggleCollapse } from '../src/core/toc';
import {
  addGroupNoteOp, addNoteOp, annotationsAfterClearingBlocks, annotationsForBlocks, cloneAnnotations, commentCount, commentsOf, defaultMark, markForBlock, moveNoteOp, removeNoteOp, setCommentColorByIdsOp, setMarkOp, updateNoteOp,
} from '../src/core/notes';
import { searchDoc } from '../src/core/search';
import { docToExportHtml } from '../src/core/export';
import { decodeBlockClipboard, encodeBlockClipboard } from '../src/core/blockClipboard';
import { blocksFromText } from '../src/core/import';
import {
  createTableBlock, tableAddColumnOp, tableAddRowOp, tableInsertColumnOp, tableInsertRowOp, tableRemoveColumnOp, tableRemoveRowOp, tableSetCellOp, tableSetColumnWidthsOp, tableSetRowHeightsOp, tableToggleHeaderOp,
} from '../src/core/table';
import { PluginRegistry } from '../src/plugins/registry';
import { Store } from '../src/core/store';
import { selectMany } from '../src/core/selection';
import { createBlock, type Doc } from '../src/core/types';
import { blockComments, commentDisplayIndex, displayComments } from '../src/features/comments/model';

function docWithTexts(texts: string[]): Doc {
  const doc = createDoc('测试');
  return {
    ...doc,
    blocks: texts.map((text) => ({ ...createBlock('paragraph'), id: `b_${text}`, html: text })),
  };
}

function expectGroupInvariants(doc: Doc): void {
  const order = new Map(doc.blocks.map((block, index) => [block.id, index]));
  const notes = doc.annotations.filter((note) => note.type === 'comment' && note.anchor.blockIds?.length);
  const byKey = new Map<string, string[]>();
  for (const note of notes) {
    const ids = note.anchor.blockIds!;
    expect(ids).toEqual([...ids].sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0)));
    expect(note.anchor.blockId).toBe(ids[0]);
    expect(ids.every((id, index) => index === 0 || order.get(id) === order.get(ids[index - 1])! + 1)).toBe(true);
    const key = ids.join('|');
    const previous = byKey.get(key);
    if (previous) expect(ids).toEqual(previous);
    else byKey.set(key, ids);
  }
}

function expectMarkInvariants(doc: Doc): void {
  const order = new Map(doc.blocks.map((block, index) => [block.id, index]));
  const grouped = new Set<string>();
  for (const note of doc.annotations) {
    if (note.type !== 'mark' || !note.anchor.blockIds?.length) continue;
    const ids = note.anchor.blockIds;
    expect(ids).toEqual([...ids].sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0)));
    expect(note.anchor.blockId).toBe(ids[0]);
    expect(ids.every((id, index) => index === 0 || order.get(id) === order.get(ids[index - 1])! + 1)).toBe(true);
    for (const id of ids) grouped.add(id);
  }
  for (const note of doc.annotations) {
    if (note.type === 'mark' && !note.anchor.blockIds?.length) {
      expect(grouped.has(note.anchor.blockId)).toBe(false);
    }
  }
}

describe('ops: 5 个原语', () => {
  it('插入块并保持顺序', () => {
    const doc = docWithTexts(['a', 'c']);
    const next = applyOps(doc, [{ t: 'insertBlocks', at: 1, blocks: [{ ...createBlock('paragraph'), id: 'b', html: 'b' }] }]);
    expect(next.blocks.map((block) => block.html)).toEqual(['a', 'b', 'c']);
    expect(next).not.toBe(doc);
  });

  it('删除块后至少保留一个块', () => {
    const doc = docWithTexts(['only']);
    const next = applyOps(doc, [{ t: 'removeBlocks', ids: ['b_only'] }]);
    expect(next.blocks).toHaveLength(1);
    expect(next.blocks[0].id).not.toBe('b_only');
  });

  it('移动块是整组移动（多选拖动 R4）', () => {
    const doc = docWithTexts(['a', 'b', 'c', 'd']);
    const next = applyOps(doc, [{ t: 'moveBlocks', ids: ['b_a', 'b_b'], at: 2 }]);
    expect(next.blocks.map((block) => block.html)).toEqual(['c', 'd', 'a', 'b']);
  });

  it('移动没有变化时返回原引用', () => {
    const doc = docWithTexts(['a', 'b']);
    const next = applyOps(doc, [{ t: 'moveBlocks', ids: ['b_a'], at: 0 }]);
    expect(next).toBe(doc);
  });

  it('patchBlock 合并字段且保留 id', () => {
    const doc = docWithTexts(['a']);
    const next = applyOps(doc, [{ t: 'patchBlock', id: 'b_a', patch: { html: 'A', align: 'center' } }]);
    expect(next.blocks[0].html).toBe('A');
    expect(next.blocks[0].align).toBe('center');
    expect(next.blocks[0].id).toBe('b_a');
  });

  it('patchBlock 删除 undefined 可选字段', () => {
    const base = docWithTexts(['a']);
    const doc: Doc = {
      ...base,
      blocks: [{ ...base.blocks[0], fontFamily: 'MiSans', fontSize: 18 }],
    };
    const next = applyOps(doc, [{
      t: 'patchBlock',
      id: 'b_a',
      patch: { fontFamily: undefined, fontSize: undefined },
    }]);
    expect('fontFamily' in next.blocks[0]).toBe(false);
    expect('fontSize' in next.blocks[0]).toBe(false);
  });

  it('patchDoc 修改标题/目录', () => {
    const doc = createDoc();
    const next = applyOps(doc, [{ t: 'patchDoc', patch: { title: '新标题' } }]);
    expect(next.title).toBe('新标题');
  });
});

describe('diff', () => {
  it('识别新增、删除、修改与顺序变化', () => {
    const before = docWithTexts(['a', 'b', 'c']);
    const after = applyOps(before, [
      { t: 'removeBlocks', ids: ['b_c'] },
      { t: 'patchBlock', id: 'b_a', patch: { html: 'A' } },
      { t: 'insertBlocks', at: 0, blocks: [{ ...createBlock('paragraph'), id: 'b_x', html: 'x' }] },
    ]);
    const diff = diffDocs(before, after);
    const ids = diff.changed.map((item) => item.id).sort();
    expect(ids).toEqual(['b_a', 'b_c', 'b_x']);
    expect(diff.orderChanged).toBe(true);
    expect(diff.metaChanged).toBe(false);
  });

  it('同一个文档没有差异', () => {
    const doc = createDoc();
    expect(diffDocs(doc, doc).empty).toBe(true);
  });
});

describe('store: 撤销/重做与选区', () => {
  it('撤销回到完全相同的文档与选区（R3/R5）', () => {
    const doc = docWithTexts(['a', 'b', 'c']);
    const store = new Store(doc, selectMany(['b_a', 'b_b']));
    store.dispatch((current) => [
      { t: 'removeBlocks', ids: ['b_a', 'b_b'] },
    ]);
    expect(store.doc.blocks).toHaveLength(1);
    expect(store.canUndo).toBe(true);

    store.undo();
    expect(store.doc.blocks).toHaveLength(3);
    expect(store.selection.blockIds).toEqual(['b_a', 'b_b']);

    store.redo();
    expect(store.doc.blocks).toHaveLength(1);
  });

  it('没有修改时不会入栈', () => {
    const store = new Store(createDoc(), selectMany([]));
    expect(store.dispatch(() => [])).toBe(false);
    expect(store.canUndo).toBe(false);
  });

  it('替换文档会清空历史', () => {
    const store = new Store(docWithTexts(['a']));
    store.dispatch(() => [{ t: 'patchBlock', id: 'b_a', patch: { html: 'A' } }]);
    expect(store.canUndo).toBe(true);
    store.replaceDoc(createDoc('另一个'));
    expect(store.canUndo).toBe(false);
    expect(store.doc.title).toBe('另一个');
  });
});

describe('迁移 v2 → schema 3', () => {
  const raw = {
    title: '旧文档',
    blocks: [
      { id: 'b1', type: 'h1', html: '第一章' },
      { id: 'b2', type: 'p', html: '正文', comments: [{ id: 'c1', html: '批注', color: '#4472C4' }] },
      { id: 'b3', type: 'p', html: '重点', important: { icon: 'star', color: '#ED7D31' } },
    ],
    groups: [{ id: 'g1', blockIds: ['b2', 'b3'], annotation: { icon: 'target', color: '#ED7D31' } }],
    toc: [
      { id: 't1', blockId: 'b1', blockIds: [], label: '第一章', parentId: null, level: 0 },
      { id: 't2', blockId: 'b2', blockIds: [], label: '子项', parentId: 'missing', level: 1 },
    ],
  };

  it('标题并入段落并保留字号与加粗', () => {
    const doc = docFromRaw(raw);
    const heading = doc.blocks[0];
    expect(heading.type).toBe('paragraph');
    expect(heading.fontSize).toBe(20);
    expect(heading.html.startsWith('<b>')).toBe(true);
  });

  it('评论与标记迁移到独立 annotations', () => {
    const doc = docFromRaw(raw);
    expect(doc.schema).toBe(4);
    const comment = doc.annotations.find((item) => item.type === 'comment' && item.anchor.blockId === 'b2');
    expect(comment?.type === 'comment' ? comment.html : '').toBe('批注');
    const mark = doc.annotations.find((item) => item.type === 'mark' && item.anchor.blockId === 'b3');
    expect(mark?.type === 'mark' ? mark.mark.icon : undefined).toBe('star');
    const groupMark = doc.annotations.find((item) => item.type === 'mark' && item.anchor.blockId === 'b2');
    expect(groupMark?.type === 'mark' ? groupMark.mark.icon : undefined).toBe('target');
  });

  it('目录挂到块上，非法父级被清空，折叠字段补齐', () => {
    const doc = docFromRaw(raw);
    expect(doc.toc).toHaveLength(2);
    expect(doc.toc[1].parentId).toBeNull();
    expect(doc.toc[0].collapsed).toBe(false);
  });

  it('无法识别的输入回退为空文档', () => {
    const doc = docFromRaw(null);
    expect(doc.blocks).toHaveLength(1);
  });

  it('组标记在 V2 保存后保留组范围', () => {
    const doc = docWithTexts(['a', 'b', 'c']);
    const marked = applyOps(doc, setMarkOp(doc, ['b_a', 'b_b', 'b_c'], defaultMark('mark'))!);
    const back = docFromRaw(docToV2(marked));
    const group = back.annotations.find((item) => item.type === 'mark' && item.anchor.blockIds?.length);
    expect(group?.type === 'mark' ? group.anchor.blockIds : undefined).toEqual(['b_a', 'b_b', 'b_c']);
  });
});

describe('目录操作', () => {
  const base: Doc = {
    ...createDoc('目录'),
    blocks: [
      { ...createBlock('paragraph'), id: 'b_a', html: '第一个' },
      { ...createBlock('paragraph'), id: 'b_b', html: '第二个' },
      { ...createBlock('paragraph'), id: 'b_c', html: '第三个' },
    ],
  };

  it('加入目录：生成条目并取块文字做标题', () => {
    const toc = addEntry(base, ['b_a', 'b_b']);
    expect(toc).toHaveLength(1);
    expect(toc?.[0].blockId).toBe('b_a');
    expect(toc?.[0].blockIds).toEqual(['b_a', 'b_b']);
    expect(toc?.[0].label).toContain('第一个');
    expect(toc?.[0].parentId).toBeNull();
  });

  it('同一组块可以重复加入目录（每次新建一条）', () => {
    const toc = addEntry(base, ['b_a']);
    const again = addEntry({ ...base, toc: toc! }, ['b_a']);
    expect(again).toHaveLength(2);
    expect(again?.[1].id).not.toBe(toc?.[0].id);
  });

  it('多选目录项标签：首块前 30 字 + 等N项；单块不截断', () => {
    const long = '这是一段很长很长的目录文字用来验证前三十个字符的截断规则是否正确处理';
    const doc: Doc = { ...base, blocks: [{ ...base.blocks[0], html: long }, base.blocks[1]] };
    const multi = addEntry(doc, ['b_a', 'b_b']);
    expect(multi?.[0].label).toBe(`${long.slice(0, 30)} 等2项`);
    const single = addEntry(doc, ['b_a']);
    expect(single?.[0].label).toBe(long);
  });

  it('拖块进目录三段落点：前 / 后 / 子级', () => {
    let toc = addEntry(base, ['b_a'])!;
    toc = addEntry({ ...base, toc }, ['b_b'])!;
    const [first, second] = toc;

    const before = addEntryAt({ ...base, toc }, ['b_c'], { entryId: first.id, position: 'before' })!;
    expect(before.findIndex((entry) => entry.blockId === 'b_c')).toBe(0);
    expect(before.find((entry) => entry.blockId === 'b_c')?.parentId).toBeNull();

    const after = addEntryAt({ ...base, toc }, ['b_c'], { entryId: first.id, position: 'after' })!;
    expect(after.map((entry) => entry.blockId).slice(0, 3)).toEqual(['b_a', 'b_c', 'b_b']);

    const inside = addEntryAt({ ...base, toc }, ['b_c'], { entryId: first.id, position: 'inside' })!;
    const child = inside.find((entry) => entry.blockId === 'b_c');
    expect(child?.parentId).toBe(first.id);
    expect(inside.find((entry) => entry.id === first.id)?.collapsed).toBe(false);
  });

  it('折叠的父项被拖入子级时自动展开', () => {
    let toc = addEntry(base, ['b_a'])!;
    toc = toc.map((entry) => ({ ...entry, collapsed: true }));
    const next = addEntryAt({ ...base, toc }, ['b_b'], { entryId: toc[0].id, position: 'inside' })!;
    expect(next.find((entry) => entry.id === toc[0].id)?.collapsed).toBe(false);
    expect(next.find((entry) => entry.blockId === 'b_b')?.parentId).toBe(toc[0].id);
  });

  it('没有落点时追加到顶层末尾', () => {
    const toc = addEntry(base, ['b_a'])!;
    const next = addEntryAt({ ...base, toc }, ['b_b'], null)!;
    expect(next.map((entry) => entry.blockId)).toEqual(['b_a', 'b_b']);
  });

  it('移动目录项：前 / 后 / 子级', () => {
    const siblings = addEntry({ ...base, toc: addEntry(base, ['b_a'])! }, ['b_b'])!;
    const [a, b] = siblings;

    const inside = moveEntry({ ...base, toc: siblings }, b.id, a.id, 'inside')!;
    expect(inside.find((entry) => entry.id === b.id)?.parentId).toBe(a.id);

    const after = moveEntry({ ...base, toc: siblings }, a.id, b.id, 'after')!;
    expect(after.map((entry) => entry.id)).toEqual([b.id, a.id]);
    expect(after.find((entry) => entry.id === a.id)?.parentId).toBeNull();
  });

  it('不能把目录移进自己的子级', () => {
    let toc = addEntry(base, ['b_a'])!;
    toc = addEntry({ ...base, toc }, ['b_b'], toc[0].id)!;
    const [a, b] = toc;
    expect(moveEntry({ ...base, toc }, a.id, b.id, 'inside')).toBeNull();
  });

  it('拖到目录末尾：变成最后一个顶层项', () => {
    const first = addEntry(base, ['b_a'])!;
    const second = addEntry({ ...base, toc: first }, ['b_b'])!;
    const next = moveEntryToEnd({ ...base, toc: second }, second[0].id)!;
    expect(next.map((entry) => entry.id)).toEqual([second[1].id, second[0].id]);
    expect(next[1].parentId).toBeNull();
  });

  it('批量删除保留未选中的子项并正确上移', () => {
    let toc = addEntry(base, ['b_a'])!;
    const a = toc[0];
    toc = addEntry({ ...base, toc }, ['b_b'], a.id)!;
    const b = toc[1];
    toc = addEntry({ ...base, toc }, ['b_c'], b.id)!;
    const c = toc[2];
    toc = addEntry({ ...base, toc }, ['b_b'])!;

    const partial = removeEntries({ ...base, toc }, [a.id, b.id])!;
    expect(partial.find((entry) => entry.id === c.id)?.parentId).toBeNull();
    expect(partial).toHaveLength(2);
  });

  it('批量移动只处理最外层选中项并拒绝移入子树', () => {
    let toc = addEntry(base, ['b_a'])!;
    toc = addEntry({ ...base, toc }, ['b_b'])!;
    toc = addEntry({ ...base, toc }, ['b_c'])!;
    const [a, b, c] = toc;
    const moved = moveEntries({ ...base, toc }, [a.id, b.id], c.id, 'inside')!;
    expect(moved.find((entry) => entry.id === a.id)?.parentId).toBe(c.id);
    expect(moved.find((entry) => entry.id === b.id)?.parentId).toBe(c.id);
    let nested = addEntry(base, ['b_a'])!;
    const parent = nested[0];
    nested = addEntry({ ...base, toc: nested }, ['b_b'], parent.id)!;
    const child = nested[1];
    expect(moveEntries({ ...base, toc: nested }, [parent.id], child.id, 'inside')).toBeNull();
    const detached = moveEntries({ ...base, toc: nested }, [child.id], parent.id, 'after')!;
    expect(detached.find((entry) => entry.id === child.id)?.parentId).toBeNull();
    const atEnd = moveEntriesToEnd({ ...base, toc: nested }, [parent.id])!;
    expect(atEnd.find((entry) => entry.id === parent.id)?.parentId).toBeNull();
  });

  it('移除目录项时子项回到上一层', () => {
    let toc = addEntry(base, ['b_a'])!;
    toc = addEntry({ ...base, toc }, ['b_b'], toc[0].id)!;
    const [a, b] = toc;
    const next = removeEntry({ ...base, toc }, a.id)!;
    expect(next).toHaveLength(1);
    expect(next[0].id).toBe(b.id);
    expect(next[0].parentId).toBeNull();
  });

  it('折叠与重命名', () => {
    const toc = addEntry(base, ['b_a'])!;
    const entryId = toc[0].id;
    const collapsed = toggleCollapse({ ...base, toc }, entryId)!;
    expect(collapsed[0].collapsed).toBe(true);
    const renamed = renameEntry({ ...base, toc: collapsed }, entryId, '  新名字  ')!;
    expect(renamed[0].label).toBe('新名字');
    expect(renameEntry({ ...base, toc }, entryId, '   ')).toBeNull();
  });
});

describe('批注与标记', () => {
  const base: Doc = {
    ...createDoc('批注'),
    blocks: [
      { ...createBlock('paragraph'), id: 'b_a', html: '第一段' },
      { ...createBlock('paragraph'), id: 'b_b', html: '第二段' },
    ],
  };

  it('添加与删除评论', () => {
    const ops = addNoteOp(base, 'b_a', '  看这里  ');
    expect(ops).toHaveLength(1);
    const next = applyOps(base, ops!);
    expect(commentCount(next, 'b_a')).toBe(1);
    expect(commentsOf(next, 'b_a')[0].html).toBe('看这里');

    const remove = removeNoteOp(next, commentsOf(next, 'b_a')[0].id);
    const cleaned = applyOps(next, remove!);
    expect(commentCount(cleaned, 'b_a')).toBe(0);
  });

  it('空评论不会产生操作', () => {
    expect(addNoteOp(base, 'b_a', '   ')).toBeNull();
  });

  it('组评论要求至少两块，并带成员列表', () => {
    expect(addGroupNoteOp(base, ['b_a'], '组评论')).toBeNull();
    const ops = addGroupNoteOp(base, ['b_a', 'b_b'], '组评论')!;
    const next = applyOps(base, ops);
    expect(commentsOf(next, 'b_a')[0].anchor.blockIds).toEqual(['b_a', 'b_b']);
  });

  it('group note stores members in document order', () => {
    const wide: Doc = {
      ...base,
      blocks: [...base.blocks, { ...createBlock('paragraph'), id: 'b_c', html: 'third' }],
    };
    const notes = applyOps(wide, addGroupNoteOp(wide, ['b_c', 'b_a', 'b_b'], 'group')!);
    const note = commentsOf(notes, 'b_a')[0];
    expect(note.anchor.blockIds).toEqual(['b_a', 'b_b', 'b_c']);
    expect(note.anchor.blockId).toBe('b_a');
  });

  it('only the exact existing group range can receive another group comment', () => {
    const first = applyOps(base, addGroupNoteOp(base, ['b_a', 'b_b'], 'first group')!);
    expect(addGroupNoteOp(first, ['b_a', 'b_b'], 'second group')).not.toBeNull();
    const wide: Doc = {
      ...base,
      blocks: [...base.blocks, { ...createBlock('paragraph'), id: 'b_c', html: 'third' }],
    };
    const withGroup = applyOps(wide, addGroupNoteOp(wide, ['b_a', 'b_b'], 'group')!);
    expect(addGroupNoteOp(wide, ['b_a', 'b_c'], 'gap')).toBeNull();
    expect(addGroupNoteOp(withGroup, ['b_a', 'b_b', 'b_c'], 'expanded')).toBeNull();
    expect(addGroupNoteOp(withGroup, ['b_b', 'b_c'], 'shifted')).toBeNull();
  });

  it('editing a comment keeps its original position', () => {
    const one = applyOps(base, addNoteOp(base, 'b_a', 'one')!);
    const two = applyOps(one, addNoteOp(one, 'b_a', 'two')!);
    const [first] = commentsOf(two, 'b_a');
    const edited = applyOps(two, updateNoteOp(two, first.id, 'one edited')!);
    expect(commentsOf(edited, 'b_a').map((note) => note.html)).toEqual(['one edited', 'two']);
  });

  it('moveNoteOp reorders comments without changing their content', () => {
    const one = applyOps(base, addNoteOp(base, 'b_a', 'one')!);
    const two = applyOps(one, addNoteOp(one, 'b_a', 'two')!);
    const [first, second] = commentsOf(two, 'b_a');
    const moved = applyOps(two, moveNoteOp(two, second.id, first.id, false)!);
    expect(commentsOf(moved, 'b_a').map((note) => note.html)).toEqual(['two', 'one']);
  });

  it('group member moving inside range stays, outside leaves', () => {
    const doc: Doc = {
      ...base,
      blocks: [
        { ...createBlock('paragraph'), id: 'b_a', html: 'a' },
        { ...createBlock('paragraph'), id: 'b_b', html: 'b' },
        { ...createBlock('paragraph'), id: 'b_c', html: 'c' },
        { ...createBlock('paragraph'), id: 'b_d', html: 'd' },
        { ...createBlock('paragraph'), id: 'b_e', html: 'e' },
      ],
    };
    const grouped = applyOps(doc, addGroupNoteOp(doc, ['b_a', 'b_b', 'b_c', 'b_d', 'b_e'], 'group')!);
    const inside = applyOps(grouped, [{ t: 'moveBlocks', ids: ['b_c'], at: 3 }]);
    const insideNote = commentsOf(inside, 'b_a')[0];
    expect(insideNote.anchor.blockIds).toEqual(['b_a', 'b_b', 'b_d', 'b_c', 'b_e']);
    expect(insideNote.anchor.blockId).toBe('b_a');

    const outside = applyOps(grouped, [{ t: 'moveBlocks', ids: ['b_c'], at: 5 }]);
    expect(commentsOf(outside, 'b_a')[0].anchor.blockIds).toEqual(['b_a', 'b_b', 'b_d', 'b_e']);
    expect(outside.blocks.map((block) => block.id)).toEqual(['b_a', 'b_b', 'b_d', 'b_e', 'b_c']);
    expectGroupInvariants(outside);
  });

  it('inserted block inside a group joins mark and comment ranges', () => {
    const doc = docWithTexts(['a', 'b', 'c']);
    const inserted = { ...createBlock('paragraph'), id: 'b_x', html: 'x' };
    const marked = applyOps(doc, setMarkOp(doc, ['b_a', 'b_b'], defaultMark('mark'))!);
    const withMark = applyOps(marked, [{ t: 'insertBlocks', at: 1, blocks: [inserted] }]);
    const mark = withMark.annotations.find((note) => note.type === 'mark' && note.anchor.blockIds?.length);
    expect(mark?.anchor.blockIds).toEqual(['b_a', 'b_x', 'b_b']);
    expectMarkInvariants(withMark);

    const commented = applyOps(doc, addGroupNoteOp(doc, ['b_a', 'b_b'], 'group')!);
    const withComment = applyOps(commented, [{ t: 'insertBlocks', at: 1, blocks: [inserted] }]);
    expect(commentsOf(withComment, 'b_a')[0].anchor.blockIds).toEqual(['b_a', 'b_x', 'b_b']);
    expectGroupInvariants(withComment);
  });

  it('moved block from outside joins the group range', () => {
    const doc: Doc = {
      ...base,
      blocks: [
        { ...createBlock('paragraph'), id: 'b_a', html: 'a' },
        { ...createBlock('paragraph'), id: 'b_b', html: 'b' },
        { ...createBlock('paragraph'), id: 'b_c', html: 'c' },
        { ...createBlock('paragraph'), id: 'b_d', html: 'd' },
      ],
    };
    const grouped = applyOps(doc, addGroupNoteOp(doc, ['b_a', 'b_b'], 'group')!);
    const moved = applyOps(grouped, [{ t: 'moveBlocks', ids: ['b_c'], at: 1 }]);
    expect(moved.blocks.map((block) => block.id)).toEqual(['b_a', 'b_c', 'b_b', 'b_d']);
    expect(commentsOf(moved, 'b_a')[0].anchor.blockIds).toEqual(['b_a', 'b_c', 'b_b']);
    expectGroupInvariants(moved);
  });

  it('group member moving into another group transfers to it', () => {
    const doc: Doc = {
      ...base,
      blocks: [
        { ...createBlock('paragraph'), id: 'b_a', html: 'a' },
        { ...createBlock('paragraph'), id: 'b_b', html: 'b' },
        { ...createBlock('paragraph'), id: 'b_c', html: 'c' },
        { ...createBlock('paragraph'), id: 'b_d', html: 'd' },
        { ...createBlock('paragraph'), id: 'b_e', html: 'e' },
      ],
    };
    const first = applyOps(doc, addGroupNoteOp(doc, ['b_a', 'b_b'], 'A')!);
    const both = applyOps(first, addGroupNoteOp(first, ['b_d', 'b_e'], 'B')!);
    const moved = applyOps(both, [{ t: 'moveBlocks', ids: ['b_b'], at: 3 }]);
    expect(moved.blocks.map((block) => block.id)).toEqual(['b_a', 'b_c', 'b_d', 'b_b', 'b_e']);
    expect(commentsOf(moved, 'b_a').map((note) => note.html)).toEqual(['A']);
    expect(commentsOf(moved, 'b_d')[0].anchor.blockIds).toEqual(['b_d', 'b_b', 'b_e']);
    expectGroupInvariants(moved);
  });

  it('whole group moving into another group merges comments below target', () => {
    const doc: Doc = {
      ...base,
      blocks: [
        { ...createBlock('paragraph'), id: 'b_a', html: 'a' },
        { ...createBlock('paragraph'), id: 'b_b', html: 'b' },
        { ...createBlock('paragraph'), id: 'b_c', html: 'c' },
        { ...createBlock('paragraph'), id: 'b_d', html: 'd' },
        { ...createBlock('paragraph'), id: 'b_e', html: 'e' },
      ],
    };
    const first = applyOps(doc, addGroupNoteOp(doc, ['b_a', 'b_b'], 'A')!);
    const both = applyOps(first, addGroupNoteOp(first, ['b_d', 'b_e'], 'B')!);
    const moved = applyOps(both, [{ t: 'moveBlocks', ids: ['b_a', 'b_b'], at: 2 }]);
    expect(moved.blocks.map((block) => block.id)).toEqual(['b_c', 'b_d', 'b_a', 'b_b', 'b_e']);
    const notes = commentsOf(moved, 'b_d');
    expect(notes.map((note) => note.html)).toEqual(['B', 'A']);
    expect(notes[0].anchor.blockIds).toEqual(['b_d', 'b_a', 'b_b', 'b_e']);
    expect(notes[1].anchor.blockIds).toEqual(['b_d', 'b_a', 'b_b', 'b_e']);
    expectGroupInvariants(moved);
  });

  it('multiple comments on the same group stay in sync', () => {
    const doc: Doc = {
      ...base,
      blocks: [
        { ...createBlock('paragraph'), id: 'b_a', html: 'a' },
        { ...createBlock('paragraph'), id: 'b_b', html: 'b' },
        { ...createBlock('paragraph'), id: 'b_c', html: 'c' },
      ],
    };
    const first = applyOps(doc, addGroupNoteOp(doc, ['b_a', 'b_b'], 'first')!);
    const both = applyOps(first, addGroupNoteOp(first, ['b_a', 'b_b'], 'second')!);
    const moved = applyOps(both, [{ t: 'moveBlocks', ids: ['b_c'], at: 1 }]);
    const notes = commentsOf(moved, 'b_a');
    expect(notes).toHaveLength(2);
    expect(notes[0].anchor.blockIds).toEqual(['b_a', 'b_c', 'b_b']);
    expect(notes[1].anchor.blockIds).toEqual(['b_a', 'b_c', 'b_b']);
    expectGroupInvariants(moved);
  });

  it('group member moving out until one remains becomes a block comment appended last', () => {
    const doc: Doc = {
      ...base,
      blocks: [
        { ...createBlock('paragraph'), id: 'b_a', html: 'a' },
        { ...createBlock('paragraph'), id: 'b_b', html: 'b' },
      ],
    };
    const withBlock = applyOps(doc, addNoteOp(doc, 'b_b', 'block note')!);
    const grouped = applyOps(withBlock, addGroupNoteOp(withBlock, ['b_a', 'b_b'], 'group note')!);
    const moved = applyOps(grouped, [{ t: 'moveBlocks', ids: ['b_a'], at: 2 }]);
    const blockNotes = blockComments(moved, 'b_b');
    expect(blockNotes.map((note) => note.html)).toEqual(['block note', 'group note']);
    expect(blockNotes[1].anchor.blockIds).toBeUndefined();
  });

  it('whole group move keeps group members unchanged', () => {
    const grouped = applyOps(base, addGroupNoteOp(base, ['b_a', 'b_b'], 'group')!);
    const moved = applyOps(grouped, [{ t: 'moveBlocks', ids: ['b_a', 'b_b'], at: 0 }]);
    expect(moved).toBe(grouped);
    expect(commentsOf(grouped, 'b_a')[0].anchor.blockIds).toEqual(['b_a', 'b_b']);
  });

  it('display order keeps annotation insertion order across block and group comments', () => {
    const grouped = applyOps(base, addGroupNoteOp(base, ['b_a', 'b_b'], 'group')!);
    const withBlock = applyOps(grouped, addNoteOp(grouped, 'b_b', 'block')!);
    const groupNote = commentsOf(grouped, 'b_a')[0];
    const blockNote = commentsOf(withBlock, 'b_b').find((note) => note.html === 'block')!;
    expect(displayComments(withBlock, 'b_b').map((note) => note.id)).toEqual([groupNote.id, blockNote.id]);
    expect(commentDisplayIndex(withBlock).get('b_b')?.map((note) => note.id)).toEqual([groupNote.id, blockNote.id]);
  });

  it('重复设置标记会替换旧标记', () => {
    const first = applyOps(base, setMarkOp(base, ['b_a'], defaultMark('mark'))!);
    const nextMark = { ...defaultMark('focus'), label: '重点' };
    const second = applyOps(first, setMarkOp(first, ['b_a'], nextMark)!);
    const marks = second.annotations.filter((item) => item.type === 'mark' && item.anchor.blockId === 'b_a');
    expect(marks).toHaveLength(1);
    expect(markForBlock(second, 'b_a')?.label).toBe('重点');
  });

  it('评论外观（头像 / 颜色）写入批注', () => {
    const ops = addNoteOp(base, 'b_a', '有外观', [], [], { color: '#00b050', avatar: '阿' });
    const next = applyOps(base, ops!);
    const comment = commentsOf(next, 'b_a')[0];
    expect(comment.avatar).toBe('阿');
    expect(comment.color).toBe('#00b050');
  });

  it('块标记独立于块字段', () => {
    const mark = defaultMark('mark');
    const marked = applyOps(base, setMarkOp(base, ['b_a', 'b_b'], mark)!);
    const groupMarks = marked.annotations.filter(
      (item) => item.type === 'mark' && item.anchor.blockIds?.length,
    );
    expect(groupMarks).toHaveLength(1);
    expect(groupMarks[0].type === 'mark' ? groupMarks[0].anchor.blockIds : undefined).toEqual(['b_a', 'b_b']);
    expect(markForBlock(marked, 'b_a')?.icon).toBe('star');
    expect(markForBlock(marked, 'b_b')?.label).toBe('标记');
    expect(Boolean('mark' in marked.blocks[0])).toBe(false);

    const cleared = applyOps(marked, setMarkOp(marked, ['b_a'], null)!);
    expect(markForBlock(cleared, 'b_a')).toBeUndefined();
    expect(markForBlock(cleared, 'b_b')).toBeUndefined();
  });

  it('清空块内容时移除完整覆盖的直接与组标注', () => {
    const doc: Doc = {
      ...base,
      annotations: [
        { id: 'c_a', type: 'comment', anchor: { blockId: 'b_a' }, html: '' },
        { id: 'c_b', type: 'comment', anchor: { blockId: 'b_b' }, html: '' },
        { id: 'm_b', type: 'mark', anchor: { blockId: 'b_b' }, mark: defaultMark('mark') },
        { id: 'cg', type: 'comment', anchor: { blockId: 'b_a', blockIds: ['b_a', 'b_b'] }, html: '' },
        { id: 'mg', type: 'mark', anchor: { blockId: 'b_a', blockIds: ['b_a', 'b_b'] }, mark: defaultMark('mark') },
      ],
    };
    const partial = annotationsAfterClearingBlocks(doc, ['b_a']);
    expect(partial?.map((item) => item.id)).toEqual(['c_b', 'm_b', 'cg', 'mg']);
    expect(annotationsAfterClearingBlocks(doc, ['b_a', 'b_b'])).toEqual([]);
  });

  it('修改组内单块标记时保留整组范围', () => {
    const marked = applyOps(base, setMarkOp(base, ['b_a', 'b_b'], defaultMark('mark'))!);
    const changed = applyOps(marked, setMarkOp(marked, ['b_a'], { ...defaultMark('focus'), label: '重点' })!);
    const groups = changed.annotations.filter(
      (item) => item.type === 'mark' && item.anchor.blockIds?.length,
    );
    expect(groups).toHaveLength(1);
    expect(groups[0].type === 'mark' ? groups[0].anchor.blockIds : undefined).toEqual(['b_a', 'b_b']);
    expect(markForBlock(changed, 'b_a')?.label).toBe('重点');
    expect(markForBlock(changed, 'b_b')?.label).toBe('重点');
  });

  it('组标记吸收移动进来的外部块', () => {
    const doc: Doc = {
      ...base,
      blocks: [
        { ...createBlock('paragraph'), id: 'm_a', html: 'a' },
        { ...createBlock('paragraph'), id: 'm_b', html: 'b' },
        { ...createBlock('paragraph'), id: 'm_c', html: 'c' },
      ],
    };
    const marked = applyOps(doc, setMarkOp(doc, ['m_a', 'm_b'], defaultMark('mark'))!);
    const moved = applyOps(marked, [{ t: 'moveBlocks', ids: ['m_c'], at: 1 }]);
    const note = moved.annotations.find((item) => item.type === 'mark' && item.anchor.blockIds?.length);
    expect(note?.type === 'mark' ? note.anchor.blockIds : undefined).toEqual(['m_a', 'm_c', 'm_b']);
    expect(markForBlock(moved, 'm_c')?.icon).toBe('star');
    expectMarkInvariants(moved);
  });

  it('组标记吸收外部块时替换其单块标记', () => {
    const doc: Doc = {
      ...base,
      blocks: [
        { ...createBlock('paragraph'), id: 'm_a', html: 'a' },
        { ...createBlock('paragraph'), id: 'm_b', html: 'b' },
        { ...createBlock('paragraph'), id: 'm_c', html: 'c' },
      ],
    };
    const grouped = applyOps(doc, setMarkOp(doc, ['m_a', 'm_b'], defaultMark('mark'))!);
    const marked = applyOps(grouped, setMarkOp(grouped, ['m_c'], defaultMark('focus'))!);
    const moved = applyOps(marked, [{ t: 'moveBlocks', ids: ['m_c'], at: 1 }]);
    const notes = moved.annotations.filter((item) => item.type === 'mark');
    expect(notes).toHaveLength(1);
    expect(notes[0].type === 'mark' ? notes[0].anchor.blockIds : undefined).toEqual(['m_a', 'm_c', 'm_b']);
    expect(markForBlock(moved, 'm_c')?.kind).toBe('mark');
    expectMarkInvariants(moved);
  });

  it('组标记只允许连续区块', () => {
    const doc: Doc = {
      ...base,
      blocks: [
        { ...createBlock('paragraph'), id: 'm_a', html: 'a' },
        { ...createBlock('paragraph'), id: 'm_b', html: 'b' },
        { ...createBlock('paragraph'), id: 'm_c', html: 'c' },
      ],
    };
    expect(setMarkOp(doc, ['m_a', 'm_c'], defaultMark('mark'))).toBeNull();
    expect(setMarkOp(doc, ['m_a', 'm_b'], defaultMark('mark'))).not.toBeNull();
  });

  it('整组标记进入另一个组后被吞并', () => {
    const doc: Doc = {
      ...base,
      blocks: [
        { ...createBlock('paragraph'), id: 'm_a1', html: 'a1' },
        { ...createBlock('paragraph'), id: 'm_a2', html: 'a2' },
        { ...createBlock('paragraph'), id: 'm_x', html: 'x' },
        { ...createBlock('paragraph'), id: 'm_b1', html: 'b1' },
        { ...createBlock('paragraph'), id: 'm_b2', html: 'b2' },
      ],
    };
    const a = applyOps(doc, setMarkOp(doc, ['m_a1', 'm_a2'], defaultMark('mark'))!);
    const both = applyOps(a, setMarkOp(a, ['m_b1', 'm_b2'], { ...defaultMark('focus'), label: 'B' })!);
    const moved = applyOps(both, [{ t: 'moveBlocks', ids: ['m_a1', 'm_a2'], at: 2 }]);
    const marks = moved.annotations.filter((item) => item.type === 'mark');
    expect(marks).toHaveLength(1);
    expect(marks[0].type === 'mark' ? marks[0].anchor.blockIds : undefined).toEqual(['m_b1', 'm_a1', 'm_a2', 'm_b2']);
    expect(markForBlock(moved, 'm_a1')?.label).toBe('B');
    expectMarkInvariants(moved);
  });

  it('组标记成员移动到另一个组范围时转组并保持连续', () => {
    const doc: Doc = {
      ...base,
      blocks: [
        { ...createBlock('paragraph'), id: 'm_a1', html: 'a1' },
        { ...createBlock('paragraph'), id: 'm_a2', html: 'a2' },
        { ...createBlock('paragraph'), id: 'm_x', html: 'x' },
        { ...createBlock('paragraph'), id: 'm_b1', html: 'b1' },
        { ...createBlock('paragraph'), id: 'm_b2', html: 'b2' },
        { ...createBlock('paragraph'), id: 'm_b3', html: 'b3' },
      ],
    };
    const a = applyOps(doc, setMarkOp(doc, ['m_a1', 'm_a2'], defaultMark('mark'))!);
    const both = applyOps(a, setMarkOp(a, ['m_b1', 'm_b2', 'm_b3'], defaultMark('focus'))!);
    const moved = applyOps(both, [{ t: 'moveBlocks', ids: ['m_b2'], at: 1 }]);
    expect(moved.blocks.map((block) => block.id)).toEqual(['m_a1', 'm_b2', 'm_a2', 'm_x', 'm_b1', 'm_b3']);
    const marks = moved.annotations.filter((item) => item.type === 'mark' && item.anchor.blockIds?.length);
    expect(marks).toHaveLength(2);
    expect(markForBlock(moved, 'm_a1')?.kind).toBe('mark');
    expect(markForBlock(moved, 'm_b2')?.kind).toBe('mark');
    expect(markForBlock(moved, 'm_b1')?.kind).toBe('focus');
    expectMarkInvariants(moved);
  });

  it('组标记移出成员，只剩一个时转普通标记', () => {
    const doc: Doc = {
      ...base,
      blocks: [
        { ...createBlock('paragraph'), id: 'm_a', html: 'a' },
        { ...createBlock('paragraph'), id: 'm_b', html: 'b' },
      ],
    };
    const marked = applyOps(doc, setMarkOp(doc, ['m_a', 'm_b'], defaultMark('mark'))!);
    const moved = applyOps(marked, [{ t: 'moveBlocks', ids: ['m_b'], at: 0 }]);
    const note = moved.annotations.find((item) => item.type === 'mark');
    expect(note?.type === 'mark' ? note.anchor : undefined).toEqual({ blockId: 'm_a' });
    expect(markForBlock(moved, 'm_a')?.icon).toBe('star');
    expect(markForBlock(moved, 'm_b')).toBeUndefined();
    expectMarkInvariants(moved);
  });

  it('组标记整组移动时成员不变', () => {
    const marked = applyOps(base, setMarkOp(base, ['b_a', 'b_b'], defaultMark('mark'))!);
    const moved = applyOps(marked, [{ t: 'moveBlocks', ids: ['b_a', 'b_b'], at: 0 }]);
    expect(moved).toBe(marked);
    expect(markForBlock(marked, 'b_a')?.icon).toBe('star');
    expect(markForBlock(marked, 'b_b')?.icon).toBe('star');
  });

  it('删除块时清理锚定在它上面的标记/评论', () => {
    const withComment = applyOps(base, addNoteOp(base, 'b_a', '评论')!);
    const marked = applyOps(withComment, setMarkOp(withComment, ['b_a', 'b_b'], defaultMark('mark'))!);
    const removed = applyOps(marked, [{ t: 'removeBlocks', ids: ['b_a'] }]);
    expect(removed.annotations.some((item) => item.anchor.blockId === 'b_a')).toBe(false);
    expect(markForBlock(removed, 'b_b')?.icon).toBe('star');
  });

  it('复制块时标记锚点重映射到新块', () => {
    const withMark = applyOps(base, setMarkOp(base, ['b_a'], defaultMark('mark'))!);
    const copies = cloneAnnotations(withMark.annotations, new Map([['b_a', 'copy_a']]));
    expect(copies).toHaveLength(1);
    expect(copies[0].anchor.blockId).toBe('copy_a');
    expect(copies[0].id).not.toBe(withMark.annotations[0].id);
  });
});

describe('搜索与导出', () => {
  const base: Doc = {
    ...createDoc('搜索'),
    blocks: [
      { ...createBlock('paragraph'), id: 'b_a', html: '洛斯里克的余灰' },
      { ...createBlock('paragraph'), id: 'b_b', html: '其他内容' },
    ],
    annotations: [{ id: 'n1', type: 'comment', anchor: { blockId: 'b_b' }, html: '这里也提到洛斯里克' }],
  };

  it('命中正文与批注', () => {
    const hits = searchDoc(base, '洛斯里克');
    expect(hits.map((hit) => hit.kind)).toEqual(['text', 'note']);
    expect(hits[0].snippet).toContain('洛斯里克');
    expect(hits[1].blockId).toBe('b_b');
  });

  it('空关键词与无结果', () => {
    expect(searchDoc(base, '   ')).toEqual([]);
    expect(searchDoc(base, '不存在')).toEqual([]);
  });

  it('导出 HTML 包含标题与表格', () => {
    const doc: Doc = {
      ...base,
      blocks: [
        { ...createBlock('paragraph'), id: 'p1', html: '正文' },
        { ...createBlock('table'), id: 't1', meta: { rows: [['甲', '乙']], header: true } },
      ],
    };
    const html = docToExportHtml(doc, 'A4');
    expect(html).toContain('搜索');
    expect(html).toContain('<table');
    expect(html).toContain('正文');
  });
});

describe('导出/保存格式（v2 兼容）', () => {
  it('docToV2 后能被 docFromRaw 读回关键字段', () => {
    const doc: Doc = {
      ...createDoc('兼容'),
      blocks: [
        { ...createBlock('paragraph'), id: 'b_a', html: '第一段' },
        { ...createBlock('quote'), id: 'b_b', html: '引用' },
      ],
      annotations: [
        { id: 'm1', type: 'mark', anchor: { blockId: 'b_a' }, mark: defaultMark('mark') },
        { id: 'n1', type: 'comment', anchor: { blockId: 'b_b' }, html: '批注' },
        { id: 'm2', type: 'mark', anchor: { blockId: 'b_b' }, mark: defaultMark('focus') },
      ],
      groups: [{ id: 'g1', blockIds: ['b_a', 'b_b'] }],
      toc: [{ id: 't1', blockId: 'b_a', blockIds: [], label: '第一段', parentId: null, level: 0, collapsed: true }],
    };
    const raw = docToV2(doc);
    expect((raw as { version: number }).version).toBe(2);
    const back = docFromRaw(raw);
    expect(back.blocks[0].type).toBe('paragraph');
    expect(markForBlock(back, 'b_a')?.icon).toBe('star');
    expect(commentsOf(back, 'b_b')[0].html).toBe('批注');
    expect(markForBlock(back, 'b_b')?.kind).toBe('focus');
    expect(back.toc[0].collapsed).toBe(true);
  });
});

describe('文本 / Markdown 导入', () => {
  it('标题转为加粗段落并保留字号', () => {
    const blocks = blocksFromText('# 大标题\n正文');
    expect(blocks[0].type).toBe('paragraph');
    expect(blocks[0].html).toContain('<b>大标题</b>');
    expect(blocks[0].fontSize).toBe(20);
    expect(blocks[1].html).toBe('正文');
  });

  it('列表 / 引用 / 分割线 / 行内格式', () => {
    const blocks = blocksFromText('- 项目\n1. 第一\n> 引用\n---\n**粗** 和 [链接](https://example.com)');
    expect(blocks.map((block) => block.type)).toEqual(['bullet', 'number', 'quote', 'divider', 'paragraph']);
    expect(blocks[4].html).toContain('<b>粗</b>');
    expect(blocks[4].html).toContain('<a href="https://example.com"');
  });

  it('空内容也至少给一个空段落', () => {
    const blocks = blocksFromText('   \n\n');
    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe('paragraph');
  });
});

describe('表格编辑', () => {
  const base: Doc = {
    ...createDoc('表格'),
    blocks: [
      { ...createBlock('table'), id: 't1', meta: { rows: [['甲', '乙'], ['1', '2']], header: true } },
    ],
  };

  it('增删行保持列数', () => {
    const added = applyOps(base, tableAddRowOp(base, 't1')!);
    expect(added.blocks[0].meta?.rows).toHaveLength(3);
    expect(added.blocks[0].meta?.rows?.[2]).toEqual(['', '']);

    const removed = applyOps(added, tableRemoveRowOp(added, 't1')!);
    expect(removed.blocks[0].meta?.rows).toHaveLength(2);
  });

  it('增删列', () => {
    const added = applyOps(base, tableAddColumnOp(base, 't1')!);
    expect(added.blocks[0].meta?.rows?.[0]).toHaveLength(3);
    const removed = applyOps(added, tableRemoveColumnOp(added, 't1')!);
    expect(removed.blocks[0].meta?.rows?.[0]).toHaveLength(2);
  });

  it('指定位置插入行/列', () => {
    const row = applyOps(base, tableInsertRowOp(base, 't1', 1)!);
    expect(row.blocks[0].meta?.rows?.map((cells) => cells[0])).toEqual(['甲', '', '1']);
    const column = applyOps(base, tableInsertColumnOp(base, 't1', 1)!);
    expect(column.blocks[0].meta?.rows?.[0]).toEqual(['甲', '', '乙']);
    const removed = applyOps(column, tableRemoveColumnOp(column, 't1', 1)!);
    expect(removed.blocks[0].meta?.rows?.[0]).toEqual(['甲', '乙']);
  });

  it('保存列宽与行高并随行列增删调整', () => {
    const sized = applyOps(base, tableSetColumnWidthsOp(base, 't1', [60, 20])!);
    expect(sized.blocks[0].meta?.columnWidths).toEqual([75, 25]);
    const withHeight = applyOps(sized, tableSetRowHeightsOp(sized, 't1', [40, 60])!);
    expect(withHeight.blocks[0].meta?.rowHeights).toEqual([40, 60]);
    const inserted = applyOps(withHeight, tableInsertColumnOp(withHeight, 't1', 1)!);
    expect(inserted.blocks[0].meta?.columnWidths).toHaveLength(3);
    const rows = applyOps(inserted, tableInsertRowOp(inserted, 't1', 1)!);
    expect(rows.blocks[0].meta?.rowHeights).toHaveLength(3);
  });

  it('动态建表并限制边界', () => {
    const table = createTableBlock(3, 4);
    expect(table.meta?.rows).toHaveLength(3);
    expect(table.meta?.rows?.[0]).toHaveLength(4);
    expect(table.meta?.header).toBe(false);
    expect(createTableBlock(0, 0).meta?.rows).toHaveLength(1);
    expect(createTableBlock(100, 100).meta?.rows).toHaveLength(50);
    expect(createTableBlock(100, 100).meta?.rows?.[0]).toHaveLength(50);
  });

  it('写入单元格 / 表头开关', () => {
    const updated = applyOps(base, tableSetCellOp(base, 't1', 1, 0, '洛斯里克')!);
    expect(updated.blocks[0].meta?.rows?.[1][0]).toBe('洛斯里克');
    expect(tableSetCellOp(updated, 't1', 1, 0, '洛斯里克')).toBeNull();

    const toggled = applyOps(base, tableToggleHeaderOp(base, 't1')!);
    expect(toggled.blocks[0].meta?.header).toBe(false);
  });

  it('富文本单元格保存后重新读取', () => {
    const rich: Doc = {
      ...base,
      blocks: [{
        ...createBlock('table'),
        id: 't1',
        meta: {
          rows: [['<span style="color:#c00000">甲</span>', '乙'], ['1', '2']],
          header: true,
          richText: true,
        },
      }],
    };
    const back = docFromRaw(docToV2(rich));
    expect(back.blocks[0].meta?.richText).toBe(true);
    expect(back.blocks[0].meta?.rows?.[0][0]).toBe('<span style="color:#c00000">甲</span>');
  });

  it('旧纯文本表格迁移为转义后的富文本', () => {
    const old = docFromRaw({ title: '旧表格', blocks: [{ id: 't1', type: 'table', meta: { rows: [['<甲>', '乙']], header: true } }] });
    expect(old.blocks[0].meta?.richText).toBe(true);
    expect(old.blocks[0].meta?.rows?.[0][0]).toBe('&lt;甲&gt;');
  });

  it('非表格块返回空操作', () => {
    const doc: Doc = { ...base, blocks: [{ ...createBlock('paragraph'), id: 'p1' }] };
    expect(tableAddRowOp(doc, 'p1')).toBeNull();
  });
});

describe('插件注册表', () => {
  it('命令注册与列出', () => {
    const registry = new PluginRegistry();
    registry.registerCommand({ id: 'p:hello', title: '打招呼', pluginId: 'p', pluginName: '示例', run: () => 'hi' });
    expect(registry.listCommands().map((command) => command.title)).toEqual(['打招呼']);
    expect(registry.listCommands()[0].run()).toBe('hi');
  });

  it('命令注册可单独释放', () => {
    const registry = new PluginRegistry();
    const offCommand = registry.registerCommand({ id: 'p:off', title: 'off', pluginId: 'p', pluginName: 'p', run: () => null });
    expect(registry.listCommands()).toHaveLength(1);
    offCommand();
    expect(registry.listCommands()).toHaveLength(0);
  });

  it('重复命令的旧 disposer 不会删除新命令', () => {
    const registry = new PluginRegistry();
    const first = registry.registerCommand({ id: 'p:same', title: 'first', pluginId: 'p', pluginName: 'p', run: () => null });
    const second = registry.registerCommand({ id: 'p:same', title: 'second', pluginId: 'p', pluginName: 'p', run: () => null });
    first();
    expect(registry.listCommands()[0]?.title).toBe('second');
    second();
    expect(registry.listCommands()).toHaveLength(0);
  });
});

describe('目录装饰层', () => {
  const doc: Doc = {
    ...createDoc('目录'),
    blocks: docWithTexts(['a', 'b', 'c']).blocks,
    toc: [
      { id: 't1', blockId: 'b_a', blockIds: [], label: 'A', parentId: null, level: 0 },
      { id: 't2', blockId: 'b_b', blockIds: [], label: 'B', parentId: 't1', level: 1 },
      { id: 't3', blockId: 'b_c', blockIds: [], label: 'C', parentId: 't1', level: 1 },
    ],
  };

  it('按层级展开，折叠后隐藏子项', () => {
    const open = buildOutline(doc);
    expect(open.nodes.map((node) => node.entry.id)).toEqual(['t1', 't2', 't3']);
    expect(open.nodes[1].depth).toBe(1);
    expect(open.total).toBe(3);

    const collapsed = buildOutline({ ...doc, toc: doc.toc.map((entry) => (entry.id === 't1' ? { ...entry, collapsed: true } : entry)) });
    expect(collapsed.nodes.map((node) => node.entry.id)).toEqual(['t1']);
    expect(collapsed.nodes[0].hasChildren).toBe(true);
  });
});

describe('import 文档校验', () => {
  it('非法或重复区块 id 会被规范化', () => {
    const doc = docFromRaw({
      title: 'x',
      blocks: [
        { id: 'bad" id', type: 'p', html: 'A', comments: [{ html: 'note' }] },
        { id: 'same', type: 'p', html: 'B' },
        { id: 'same', type: 'p', html: 'C' },
      ],
      comments: [],
      toc: [{ id: 'toc', blockId: 'same', blockIds: [], label: 'T', parentId: null, level: 0 }],
    });
    const ids = doc.blocks.map((block) => block.id);
    expect(new Set(ids).size).toBe(3);
    expect(ids.every((id) => /^[A-Za-z0-9_-]{1,80}$/.test(id))).toBe(true);
    expect(doc.toc[0]?.blockId).toBe(ids[1]);
    const comment = doc.annotations.find((item) => item.type === 'comment');
    expect(comment?.anchor.blockId).toBe(ids[0]);
  });
});

describe('区块剪贴板', () => {
  it('编码后可完整解析区块和注释', () => {
    const block = { ...createBlock('paragraph'), id: 'clip_block', html: '剪贴板内容' };
    const content = encodeBlockClipboard([block], []);
    expect(content.text).toContain('剪贴板内容');
    expect(content.html).toContain('data-dafeiyu-blocks');
    const decoded = decodeBlockClipboard(content.html);
    expect(decoded?.blocks).toHaveLength(1);
    expect(decoded?.blocks[0].id).toBe('clip_block');
    expect(decoded?.blocks[0].html).toBe('剪贴板内容');
  });

  it('拒绝非法块类型、非法 ID 和重复 ID', () => {
    const block = { ...createBlock('paragraph'), id: 'clip_valid', html: 'x' };
    const make = (candidate: unknown) => {
      const payload = { v: 1, blocks: [candidate], annotations: [] };
      return `<div data-dafeiyu-blocks="${encodeURIComponent(JSON.stringify(payload))}"></div>`;
    };
    expect(decodeBlockClipboard(make({ ...block, type: 'bad' }))).toBeNull();
    expect(decodeBlockClipboard(make({ ...block, id: 'bad id' }))).toBeNull();
    expect(decodeBlockClipboard(make({ ...block, id: 'same' }))).not.toBeNull();
    const duplicate = { v: 1, blocks: [{ ...block, id: 'same' }, { ...block, id: 'same' }], annotations: [] };
    expect(decodeBlockClipboard(`<div data-dafeiyu-blocks="${encodeURIComponent(JSON.stringify(duplicate))}"></div>`)).toBeNull();
  });

  it('普通 HTML 不当成区块剪贴板', () => {
    expect(decodeBlockClipboard('<p>普通文字</p>')).toBeNull();
    expect(decodeBlockClipboard('<div data-dafeiyu-blocks="bad">x</div>')).toBeNull();
  });
});



describe('块插入位置', () => {
  const make = (blocks: Doc['blocks']) => ({ ...docWithTexts([]), blocks });

  it('单选空段落原地替换', () => {
    const doc = make([{ ...createBlock('paragraph'), id: 'empty', html: '' }]);
    expect(resolveBlockPlacement(doc, ['empty'])).toMatchObject({ index: 1, replace: true });
  });

  it('图表插到选中图表之后', () => {
    const doc = make([
      { ...createBlock('paragraph'), id: 'before', html: 'before' },
      { ...createBlock('chart'), id: 'chart' },
    ]);
    expect(resolveBlockPlacement(doc, ['chart'])).toMatchObject({ index: 2, replace: false });
  });

  it('空引用不替换', () => {
    const doc = make([{ ...createBlock('quote'), id: 'quote', html: '' }]);
    expect(resolveBlockPlacement(doc, ['quote'])).toMatchObject({ index: 1, replace: false });
  });

  it('多选以文档顺序最后一个选中块为准', () => {
    const doc = make([
      { ...createBlock('chart'), id: 'chart' },
      { ...createBlock('paragraph'), id: 'empty', html: '' },
    ]);
    expect(resolveBlockPlacement(doc, ['empty', 'chart'])).toMatchObject({ index: 2, replace: false });
  });

  it('没有选中块返回 null', () => {
    expect(resolveBlockPlacement(make([]), [])).toBeNull();
  });
});

describe('block insertion plan', () => {
  const source = [
    { id: 'x', type: 'paragraph' as const, html: '1' },
    { id: 'y', type: 'paragraph' as const, html: '2' },
  ];
  const sourceNotes = [{ id: 'n_x', type: 'comment' as const, anchor: { blockId: 'x' }, html: 'note' }];

  it('replaces an empty target with new blocks', () => {
    const doc: Doc = {
      ...createDoc('paste'),
      blocks: [
        { id: 'a', type: 'paragraph', html: 'a' },
        { id: 'b', type: 'paragraph', html: 'b' },
        { id: 't', type: 'paragraph', html: '' },
        { id: 'c', type: 'paragraph', html: 'c' },
      ],
      annotations: [],
    };
    const plan = createBlockInsertionPlan(doc, ['t'], source, sourceNotes)!;
    const after = applyOps(doc, plan.ops);
    expect(after.blocks.map((block) => block.id)).toEqual(['a', 'b', ...plan.selection, 'c']);
    expect(after.blocks.some((block) => block.id === 't')).toBe(false);
    expect(after.annotations.some((note) => note.anchor.blockId === plan.selection[0])).toBe(true);
    expect(after.annotations.some((note) => note.id === 'n_x')).toBe(false);
    expect(plan.anchorId).toBe(plan.selection[0]);
  });

  it('keeps an empty target that has annotations', () => {
    const doc: Doc = {
      ...createDoc('paste'),
      blocks: [
        { id: 'a', type: 'paragraph', html: 'a' },
        { id: 't', type: 'paragraph', html: '' },
        { id: 'c', type: 'paragraph', html: 'c' },
      ],
      annotations: [{ id: 'n_t', type: 'comment', anchor: { blockId: 't' }, html: 'keep' }],
    };
    const plan = createBlockInsertionPlan(doc, ['t'], source, [])!;
    const after = applyOps(doc, plan.ops);
    expect(after.blocks.some((block) => block.id === 't')).toBe(true);
    expect(after.annotations.some((note) => note.id === 'n_t')).toBe(true);
    expect(after.blocks.map((block) => block.id)).toEqual(['a', 't', ...plan.selection, 'c']);
  });

  it('can preserve plugin-created block ids', () => {
    const doc: Doc = {
      ...createDoc('plugin'),
      blocks: [{ id: 'a', type: 'paragraph', html: 'a' }],
    };
    const pluginBlock = { id: 'plugin-block', type: 'image' as const, html: '', meta: { src: 'x', width: 100 } };
    const plan = createBlockInsertionPlan(doc, ['a'], [pluginBlock], [], { preserveIds: true })!;
    const after = applyOps(doc, plan.ops);
    expect(plan.selection).toEqual(['plugin-block']);
    expect(after.blocks.some((block) => block.id === 'plugin-block')).toBe(true);
  });

  it('does not replace when the empty target is part of a multi-selection', () => {
    const doc: Doc = {
      ...createDoc('paste'),
      blocks: [
        { id: 'a', type: 'paragraph', html: 'a' },
        { id: 't', type: 'paragraph', html: '' },
        { id: 'c', type: 'paragraph', html: 'c' },
      ],
      annotations: [],
    };
    const plan = createBlockInsertionPlan(doc, ['a', 't'], source, [])!;
    const after = applyOps(doc, plan.ops);
    expect(after.blocks.map((block) => block.id)).toEqual(['a', 't', ...plan.selection, 'c']);
    expect(plan.anchorId).toBe('t');
  });
});

describe('format and paste invariants', () => {
  it('strips font fields when a text block becomes empty', () => {
    const doc: Doc = {
      ...createDoc('format'),
      blocks: [{ id: 'a', type: 'paragraph', html: 'A', fontFamily: 'LXGW WenKai', fontSize: 18 }],
    };
    const next = applyOps(doc, [{ t: 'patchBlock', id: 'a', patch: { html: '' } }]);
    expect(next.blocks[0].fontFamily).toBeUndefined();
    expect(next.blocks[0].fontSize).toBeUndefined();
  });

  it('strips font fields from inserted empty blocks and loaded legacy data', () => {
    const empty = { id: 'e', type: 'paragraph' as const, html: '', fontFamily: 'LXGW WenKai', fontSize: 18 };
    const inserted = applyOps(createDoc('insert'), [{ t: 'insertBlocks', at: 1, blocks: [empty] }]);
    expect(inserted.blocks[1].fontFamily).toBeUndefined();
    expect(inserted.blocks[1].fontSize).toBeUndefined();
    const loaded = docFromRaw({ version: 2, blocks: [{ id: 'e', type: 'p', html: '', fontFamily: 'LXGW WenKai', fontSize: 18 }] });
    expect(loaded.blocks[0].fontFamily).toBeUndefined();
    expect(loaded.blocks[0].fontSize).toBeUndefined();
  });

  it('removes all toc entries that reference deleted blocks and reparents children', () => {
    const entry = (id: string, blockId: string, blockIds: string[] = [], parentId: string | null = null) => ({
      id, blockId, blockIds, label: id, parentId, level: 0, collapsed: false,
    });
    const doc: Doc = {
      ...createDoc('toc'),
      blocks: [
        { id: 'a', type: 'paragraph', html: 'a' },
        { id: 'b', type: 'paragraph', html: 'b' },
        { id: 'c', type: 'paragraph', html: 'c' },
      ],
      toc: [
        entry('t1', 'a'),
        entry('t2', 'a'),
        entry('t3', 'b', ['a', 'b']),
        entry('t4', 'c', [], 't1'),
        entry('t5', 'c'),
      ],
    };
    const next = applyOps(doc, [{ t: 'removeBlocks', ids: ['a'] }]);
    expect(next.toc.map((item) => item.id)).toEqual(['t4', 't5']);
    expect(next.toc[0].parentId).toBeNull();
  });

  it('copies a group annotation only when all members are selected', () => {
    const doc: Doc = {
      ...createDoc('group copy'),
      blocks: [
        { id: 'a', type: 'paragraph', html: 'a' },
        { id: 'b', type: 'paragraph', html: 'b' },
      ],
      annotations: [{ id: 'g1', type: 'comment', anchor: { blockId: 'a', blockIds: ['a', 'b'] }, html: 'group' }],
    };
    expect(annotationsForBlocks(doc, ['a'])).toEqual([]);
    expect(annotationsForBlocks(doc, ['a', 'b']).map((item) => item.id)).toEqual(['g1']);
  });

  it('keeps group expansion caused by insertion when cloning annotations', () => {
    const doc: Doc = {
      ...createDoc('group paste'),
      blocks: [
        { id: 'a', type: 'paragraph', html: 'a' },
        { id: 'b', type: 'paragraph', html: 'b' },
        { id: 'c', type: 'paragraph', html: 'c' },
      ],
      annotations: [{ id: 'g1', type: 'comment', anchor: { blockId: 'a', blockIds: ['a', 'b'] }, html: 'group' }],
    };
    const plan = createBlockInsertionPlan(
      doc,
      ['a'],
      [{ id: 'x', type: 'paragraph', html: 'x' }],
      [{ id: 'n_x', type: 'comment', anchor: { blockId: 'x' }, html: 'copy' }],
    )!;
    const after = applyOps(doc, plan.ops);
    const group = after.annotations.find((item) => item.id === 'g1');
    expect(group?.anchor.blockIds).toContain(plan.selection[0]);
    expect(after.annotations.some((item) => item.anchor.blockId === plan.selection[0])).toBe(true);
  });
});

describe('comment color by id', () => {
  it('changes exactly the selected comment ids', () => {
    const doc: Doc = {
      ...createDoc('color'),
      blocks: [{ id: 'a', type: 'paragraph', html: 'a' }],
      annotations: [
        { id: 'n1', type: 'comment', anchor: { blockId: 'a' }, html: 'one' },
        { id: 'n2', type: 'comment', anchor: { blockId: 'a' }, html: 'two' },
      ],
    };
    const next = applyOps(doc, setCommentColorByIdsOp(doc, ['n2'], '#ff0000')!);
    expect(next.annotations.find((item) => item.id === 'n1')?.color).toBeUndefined();
    expect(next.annotations.find((item) => item.id === 'n2')?.color).toBe('#ff0000');
  });
});
