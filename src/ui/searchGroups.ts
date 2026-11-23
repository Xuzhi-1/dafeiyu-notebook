import type { Doc } from '../core/types.js';
import type { SearchCommentGroup, SearchCommentPort, SearchHit } from '../core/search.js';
import { searchMetaFor, type SearchMeta } from './searchMeta.js';

export interface SearchRail {
  readonly first: number;
  readonly last: number;
  readonly color?: string;
}

export interface SearchGroups {
  readonly meta: Map<string, SearchMeta>;
  readonly typeFirst: Map<string, number>;
  readonly markFirst: Map<string, number>;
  readonly commentMeta: Map<string, SearchCommentGroup | undefined>;
  readonly commentMarker: ReadonlyMap<string, number>;
  readonly markRails: SearchRail[];
  readonly commentRails: SearchRail[];
  readonly typeRails: SearchRail[];
}

/** 搜索结果分组：只计算数据，不碰 DOM。 */
export function buildSearchGroups(
  doc: Doc,
  hits: readonly SearchHit[],
  comments: SearchCommentPort,
): SearchGroups {
  const meta = new Map<string, SearchMeta>();
  const typeFirst = new Map<string, number>();
  const typeLast = new Map<string, number>();
  const markFirst = new Map<string, number>();
  const markLast = new Map<string, number>();
  const markColors = new Map<string, string | undefined>();
  const commentMeta = new Map<string, SearchCommentGroup | undefined>();
  const commentHits = new Map<string, number[]>();
  const commentNote = new Map<string, number>();
  const commentColors = new Map<string, string | undefined>();

  hits.forEach((hit, index) => {
    const typeKey = hit.cell ? `table:${hit.blockId}` : hit.kind === 'chart' ? `chart:${hit.blockId}` : '';
    if (typeKey) {
      if (!typeFirst.has(typeKey)) typeFirst.set(typeKey, index);
      typeLast.set(typeKey, index);
    }

    let group: SearchCommentGroup | undefined;
    let inRange = false;
    if (hit.kind === 'note' && hit.noteId) {
      const note = doc.annotations.find((item) => item.type === 'comment' && item.id === hit.noteId);
      if (note?.type === 'comment' && note.anchor.blockIds?.length) {
        group = { id: note.id, color: note.color };
        commentNote.set(note.id, index);
      }
    } else {
      let info = meta.get(hit.blockId);
      if (!info) {
        info = searchMetaFor(doc, hit.blockId);
        meta.set(hit.blockId, info);
      }
      if (info.mark) {
        const markKey = info.markGroupId ? `group:${info.markGroupId}` : `block:${hit.blockId}`;
        if (!markFirst.has(markKey)) markFirst.set(markKey, index);
        if (info.markGroupId) {
          markLast.set(markKey, index);
          markColors.set(markKey, info.mark.color);
        }
      }
      if (!commentMeta.has(hit.blockId)) {
        commentMeta.set(hit.blockId, comments.groupForBlock(doc, hit.blockId));
      }
      group = commentMeta.get(hit.blockId);
      inRange = Boolean(group);
    }
    if (group && inRange) {
      const indexes = commentHits.get(group.id);
      if (indexes) indexes.push(index);
      else commentHits.set(group.id, [index]);
      commentColors.set(group.id, group.color);
    }
  });

  const commentMarker = new Map(commentNote);
  return {
    meta,
    typeFirst,
    markFirst,
    commentMeta,
    commentMarker,
    markRails: rails(markFirst, markLast, markColors),
    commentRails: commentRanges(commentHits, commentColors),
    typeRails: rails(typeFirst, typeLast, new Map()),
  };
}

function commentRanges(
  hits: ReadonlyMap<string, readonly number[]>,
  colors: ReadonlyMap<string, string | undefined>,
): SearchRail[] {
  return [...hits].map(([id, indexes]) => {
    const first = indexes[0];
    const last = indexes[indexes.length - 1];
    const color = colors.get(id);
    return color ? { first, last, color } : { first, last };
  });
}

function rails(
  first: ReadonlyMap<string, number>,
  last: ReadonlyMap<string, number>,
  colors: ReadonlyMap<string, string | undefined>,
): SearchRail[] {
  const result: SearchRail[] = [];
  for (const [key, start] of first) {
    const end = last.get(key);
    if (end === undefined || end <= start) continue;
    const color = colors.get(key);
    result.push(color ? { first: start, last: end, color } : { first: start, last: end });
  }
  return result;
}
