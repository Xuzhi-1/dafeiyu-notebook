/**
 * 文档工厂与迁移：把磁盘上的旧格式（v2/v3）转成内部模型（schema 4）。
 *
 * 迁移规则：
 * - h1/h2/h3 → 普通段落，保留字号/加粗；
 * - block.comments → 独立 CommentAnnotation；
 * - block.important / block.mark → 独立 MarkAnnotation；
 * - group.annotation / group.mark → 首块的 MarkAnnotation；
 * - toc 增加 collapsed；
 * - 磁盘仍写 v2 兼容结构：注释/标记会扁平化回 comments / important。
 */

import type {
  Annotation, Block, BlockType, CommentAnnotation, Doc, Group, Mark, MarkAnnotation, TocEntry,
} from './types.js';
import { createBlock, uid } from './types.js';
import { normalizeBlock } from './blockFormat.js';

const TYPE_MAP: Record<string, BlockType> = {
  p: 'paragraph',
  paragraph: 'paragraph',
  h1: 'paragraph',
  h2: 'paragraph',
  h3: 'paragraph',
  quote: 'quote',
  bullet: 'bullet',
  number: 'number',
  table: 'table',
  image: 'image',
  divider: 'divider',
  chart: 'chart',
};

const HEADING_SIZE: Record<string, number> = { h1: 20, h2: 16, h3: 14 };

function escapeTableText(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

interface RawRecord {
  [key: string]: unknown;
}

const isRecord = (value: unknown): value is RawRecord => typeof value === 'object' && value !== null && !Array.isArray(value);
const asString = (value: unknown, fallback = ''): string => (typeof value === 'string' ? value : fallback);
const asNumber = (value: unknown): number | undefined => (typeof value === 'number' && Number.isFinite(value) ? value : undefined);
const ID_PATTERN = /^[A-Za-z0-9_-]{1,80}$/;
const safeId = (value: unknown, prefix: string): string => {
  const raw = typeof value === 'string' ? value : '';
  return ID_PATTERN.test(raw) ? raw : uid(prefix);
};

function migrateComment(raw: unknown, blockId: string): CommentAnnotation | null {
  if (!isRecord(raw)) return null;
  const html = asString(raw.html);
  const images = Array.isArray(raw.images) ? raw.images.filter((item): item is string => typeof item === 'string') : undefined;
  const imageWidths = Array.isArray(raw.imageWidths)
    ? raw.imageWidths.filter((item): item is number => typeof item === 'number' && Number.isFinite(item)).map((item) => Math.min(100, Math.max(10, Math.round(item))))
    : undefined;
  const imageAligns = Array.isArray(raw.imageAligns)
    ? raw.imageAligns.filter((item): item is 'left' | 'center' | 'right' => item === 'left' || item === 'center' || item === 'right')
    : undefined;
  const groupIds = Array.isArray(raw.groupIds) ? raw.groupIds.filter((item): item is string => typeof item === 'string') : undefined;
  if (!html.trim() && !images?.length) return null;
  const anchor = groupIds && groupIds.length > 1 ? { blockId, blockIds: groupIds } : { blockId };
  return {
    id: safeId(raw.id, 'n'),
    type: 'comment',
    anchor,
    html,
    format: raw.format === 'html' ? 'html' : undefined,
    color: asString(raw.color) || undefined,
    avatar: asString(raw.avatar) || undefined,
    images,
    imageWidths,
    imageAligns,
    createdAt: asNumber(raw.createdAt),
  };
}

function migrateMark(raw: unknown, kind: Mark['kind'] = 'mark'): Mark | undefined {
  if (!isRecord(raw)) return undefined;
  const rawLabel = asString(raw.label);
  const mark: Mark = {
    kind: raw.kind === 'focus' ? 'focus' : kind,
    icon: asString(raw.icon) || undefined,
    color: asString(raw.color) || undefined,
    // 旧版默认标签是“标注”，新版统一显示为“标记”
    label: rawLabel === '标注' ? '标记' : rawLabel || undefined,
    shape: asString(raw.shape) || undefined,
    image: asString(raw.image) || undefined,
  };
  if (!mark.icon && !mark.color && !mark.label && !mark.image) return undefined;
  return mark;
}

function migrateBlock(raw: unknown): Block | null {
  if (!isRecord(raw)) return null;
  const rawType = asString(raw.type, 'p');
  const type = TYPE_MAP[rawType] ?? 'paragraph';
  const headingSize = HEADING_SIZE[rawType];

  let html = asString(raw.html);
  if (headingSize) {
    if (!/<(b|strong)[\s>]/i.test(html) && html.trim()) html = `<b>${html}</b>`;
  }

  const block: Block = {
    id: asString(raw.id) || uid('b'),
    type,
    html,
    align: (['left', 'center', 'right', 'justify'] as const).includes(asString(raw.align) as never)
      ? (asString(raw.align) as Block['align'])
      : undefined,
    indent: asNumber(raw.indent),
    fontFamily: asString(raw.fontFamily) || undefined,
    fontSize: headingSize ?? asNumber(raw.fontSize),
    meta: isRecord(raw.meta) ? (raw.meta as Block['meta']) : undefined,
  };

  if (type === 'table' && !block.meta?.rows) {
    return { ...block, meta: { ...(block.meta ?? {}), rows: [['', ''], ['', '']], header: true, richText: true } };
  }
  if (type === 'table' && !block.meta?.richText && block.meta?.rows) {
    const rows = block.meta.rows.map((row) => row.map((cell) => escapeTableText(String(cell))));
    return { ...block, meta: { ...block.meta, rows, richText: true } };
  }
  if (type === 'image' && !block.meta?.src) {
    const src = isRecord(raw.meta) && typeof raw.meta.src === 'string'
      ? raw.meta.src
      : (html.match(/src="([^"]+)"/)?.[1] ?? '');
    return { ...block, meta: { ...(block.meta ?? {}), src, width: block.meta?.width ?? 100 } };
  }
  return block;
}

function migrateGroup(raw: unknown): { group: Group; mark?: Mark } | null {
  if (!isRecord(raw)) return null;
  const blockIds = Array.isArray(raw.blockIds)
    ? raw.blockIds.filter((item): item is string => typeof item === 'string')
    : [];
  if (!blockIds.length) return null;
  const mark = migrateMark(raw.annotation ?? raw.mark, 'mark');
  const group: Group = { id: safeId(raw.id, 'g'), blockIds };
  return { group, mark };
}

function migrateToc(raw: unknown): TocEntry | null {
  if (!isRecord(raw)) return null;
  const blockId = asString(raw.blockId);
  if (!blockId) return null;
  const blockIds = Array.isArray(raw.blockIds)
    ? raw.blockIds.filter((item): item is string => typeof item === 'string')
    : [];
  return {
    id: safeId(raw.id, 'toc'),
    blockId,
    blockIds,
    label: asString(raw.label, '未命名目录'),
    parentId: typeof raw.parentId === 'string' ? raw.parentId : null,
    level: asNumber(raw.level) ?? 0,
    collapsed: Boolean(raw.collapsed),
  };
}

/** 把任意磁盘数据转成内部文档；无法识别时返回一个空文档 */
export function docFromRaw(raw: unknown, fallbackTitle = '无标题文档'): Doc {
  if (!isRecord(raw)) return { ...createDoc(fallbackTitle) };
  const rawBlocks = Array.isArray(raw.blocks) ? raw.blocks.filter(isRecord) : [];
  const blocks = rawBlocks.map(migrateBlock).filter((block): block is Block => Boolean(block));
  const idMap = new Map<string, string>();
  const usedIds = new Set<string>();
  const safeBlocks = (blocks.length ? blocks : [createBlock('paragraph')]).map((block) => {
    let id = safeId(block.id, 'b');
    while (usedIds.has(id)) id = uid('b');
    usedIds.add(id);
    if (!idMap.has(block.id)) idMap.set(block.id, id);
    return id === block.id ? block : { ...block, id };
  });
  const validIds = new Set(safeBlocks.map((block) => block.id));
  const annotations: Annotation[] = [];
  const groupMarkMembers = new Set<string>();

  rawBlocks.forEach((record, index) => {
    const block = safeBlocks[index];
    if (!block) return;
    const comments = Array.isArray(record.comments) ? record.comments : [];
    for (const item of comments) {
      const comment = migrateComment(item, block.id);
      if (comment) annotations.push(comment);
    }
    const mark = migrateMark(record.important ?? record.mark ?? record.focus, 'mark');
    if (mark) {
      const annotation: MarkAnnotation = { id: uid('m'), type: 'mark', anchor: { blockId: block.id }, mark };
      annotations.push(annotation);
    }
  });

  const rawMarkGroups = Array.isArray(raw.markGroups) ? raw.markGroups : [];
  for (const item of rawMarkGroups) {
    if (!isRecord(item)) continue;
    const ids = Array.isArray(item.blockIds)
      ? [...new Set(item.blockIds.map((id) => idMap.get(String(id))).filter((id): id is string => Boolean(id && validIds.has(id))))]
      : [];
    if (ids.length < 2) continue;
    const mark = migrateMark(item.mark, 'mark');
    if (!mark) continue;
    annotations.push({
      id: safeId(item.id, 'm'),
      type: 'mark',
      anchor: { blockId: ids[0], blockIds: ids },
      mark,
    });
    ids.forEach((id) => groupMarkMembers.add(id));
  }

  const groups = (Array.isArray(raw.groups) ? raw.groups.map(migrateGroup) : [])
    .filter((item): item is { group: Group; mark?: Mark } => Boolean(item))
    .map((item) => ({ ...item, group: { ...item.group, blockIds: item.group.blockIds.map((id) => idMap.get(id)).filter((id): id is string => Boolean(id && validIds.has(id))) } }))
    .filter((item) => item.group.blockIds.length > 1);

  for (const item of groups) {
    if (!item.mark) continue;
    const annotation: MarkAnnotation = {
      id: uid('m'),
      type: 'mark',
      anchor: { blockId: item.group.blockIds[0], blockIds: item.group.blockIds },
      mark: item.mark,
    };
    annotations.push(annotation);
  }

  const toc = (Array.isArray(raw.toc) ? raw.toc.map(migrateToc) : [])
    .filter((entry): entry is TocEntry => Boolean(entry))
    .map((entry) => ({
      ...entry,
      blockId: idMap.get(entry.blockId) ?? entry.blockId,
      blockIds: entry.blockIds.map((id) => idMap.get(id)).filter((id): id is string => Boolean(id)),
    }))
    .filter((entry) => validIds.has(entry.blockId));

  const parentIds = new Set(toc.map((entry) => entry.id));
  const safeToc = toc.map((entry) => (entry.parentId && parentIds.has(entry.parentId) ? entry : { ...entry, parentId: null }));

  const filteredAnnotations = annotations.filter((annotation) => !(
    annotation.type === 'mark'
    && !annotation.anchor.blockIds?.length
    && groupMarkMembers.has(annotation.anchor.blockId)
  ));
  const mappedAnnotations = filteredAnnotations.map((annotation) => {
    if (annotation.type !== 'comment' || !annotation.anchor.blockIds?.length) return annotation;
    const members = annotation.anchor.blockIds
      .map((id) => idMap.get(id))
      .filter((id): id is string => Boolean(id && validIds.has(id)));
    if (!members.length) return annotation;
    return {
      ...annotation,
      anchor: members.length > 1
        ? { blockId: idMap.get(annotation.anchor.blockId) ?? members[0], blockIds: members }
        : { blockId: members[0] },
    };
  });

  const now = Date.now();
  return {
    schema: 4,
    title: asString(raw.title, fallbackTitle) || fallbackTitle,
    createdAt: asNumber(raw.createdAt) ?? now,
    updatedAt: asNumber(raw.updatedAt) ?? now,
    blocks: safeBlocks.map(normalizeBlock),
    annotations: mappedAnnotations,
    groups: groups.map((item) => item.group),
    toc: safeToc,
  };
}

export function createDoc(title = '无标题文档'): Doc {
  const now = Date.now();
  return {
    schema: 4,
    title,
    createdAt: now,
    updatedAt: now,
    blocks: [createBlock('paragraph')],
    annotations: [],
    groups: [],
    toc: [],
  };
}

const V2_TYPE: Record<BlockType, string> = {
  paragraph: 'p',
  quote: 'quote',
  bullet: 'bullet',
  number: 'number',
  table: 'table',
  image: 'image',
  divider: 'divider',
  chart: 'chart',
};

/**
 * 保存为旧版可读的 v2 结构：
 * annotations 里的注释/标记会扁平化回 block.comments / block.important，
 * 这样旧版仍能打开；新版加载时再迁回 annotations。
 */
export function docToV2(doc: Doc): Record<string, unknown> {
  const commentsFor = (blockId: string): CommentAnnotation[] => doc.annotations.filter(
    (annotation): annotation is CommentAnnotation => annotation.type === 'comment' && annotation.anchor.blockId === blockId,
  );
  const markFor = (blockId: string): Mark | undefined => doc.annotations.find(
    (annotation): annotation is MarkAnnotation => annotation.type === 'mark'
      && !annotation.anchor.blockIds?.length
      && annotation.anchor.blockId === blockId,
  )?.mark;

  return {
    version: 2,
    app: 'dafeiyu-notebook',
    title: doc.title,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    blocks: doc.blocks.map((block) => ({
      id: block.id,
      type: V2_TYPE[block.type] ?? 'p',
      html: block.html,
      align: block.align,
      indent: block.indent,
      fontFamily: block.fontFamily,
      fontSize: block.fontSize,
      meta: block.meta ?? {},
      comments: commentsFor(block.id).map((annotation) => ({
        id: annotation.id,
        html: annotation.html,
        format: annotation.format,
        color: annotation.color,
        avatar: annotation.avatar,
        images: annotation.images,
        imageWidths: annotation.imageWidths,
        imageAligns: annotation.imageAligns,
        groupIds: annotation.anchor.blockIds,
        createdAt: annotation.createdAt,
      })),
      important: markFor(block.id),
    })),
    markGroups: doc.annotations
      .filter((annotation): annotation is MarkAnnotation => annotation.type === 'mark' && Boolean(annotation.anchor.blockIds?.length))
      .map((annotation) => ({ id: annotation.id, blockIds: annotation.anchor.blockIds, mark: annotation.mark })),
    groups: doc.groups.map((group) => ({ id: group.id, blockIds: group.blockIds })),
    toc: doc.toc.map((entry) => ({
      id: entry.id,
      blockId: entry.blockId,
      blockIds: entry.blockIds,
      label: entry.label,
      parentId: entry.parentId,
      level: entry.level,
      collapsed: entry.collapsed,
    })),
  };
}
