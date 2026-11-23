/**
 * 文档模型：唯一事实来源（不可变数据结构）。
 *
 * 约定：
 * - 所有字段 readonly；修改一律通过 core/ops.ts 的 5 个原语产生新文档；
 * - 块是内容的唯一容器，注释/标记挂在块或组上，不改块内文字结构；
 * - 目录与分组是文档的一部分（随文件保存），不做“界面状态”。
 */

export type CellAlign = 'left' | 'center' | 'right' | 'justify';

export type BlockType = 'paragraph' | 'quote' | 'bullet' | 'number' | 'table' | 'image' | 'divider' | 'chart';
export type ChartKind = 'bar' | 'line' | 'pie';
export interface ChartSeries {
  readonly name: string;
  readonly values: readonly number[];
}
export interface ChartSpec {
  readonly kind: ChartKind;
  readonly title: string;
  readonly categories: readonly string[];
  readonly series: readonly ChartSeries[];
  readonly source?: { readonly tableId: string; readonly updatedAt: number };
}

/** 块级/组级标记（视觉徽章，不带对话） */
export interface Mark {
  readonly kind: 'mark' | 'focus';
  readonly icon?: string;
  readonly color?: string;
  readonly label?: string;
  readonly shape?: string;
  readonly image?: string;
}

/** 标记/注释的锚点：至少指向一个块；组注释/组标记可带成员列表 */
export interface AnnotationAnchor {
  readonly blockId: string;
  readonly blockIds?: readonly string[];
}

export interface MarkAnnotation {
  readonly id: string;
  readonly type: 'mark';
  readonly anchor: AnnotationAnchor;
  readonly mark: Mark;
}

export interface CommentAnnotation {
  readonly id: string;
  readonly type: 'comment';
  readonly anchor: AnnotationAnchor;
  readonly html: string;
  /** html 字段是否为受控富文本；缺省表示旧版纯文本。 */
  readonly format?: 'html';
  readonly color?: string;
  readonly avatar?: string;
  readonly images?: readonly string[];
  /** 与 images 对应的显示宽度百分比。 */
  readonly imageWidths?: readonly number[];
  readonly imageAligns?: readonly ('left' | 'center' | 'right')[];
  readonly createdAt?: number;
}

export type Annotation = MarkAnnotation | CommentAnnotation;

export interface TableCellSpan {
  readonly rowSpan: number;
  readonly colSpan: number;
}

export interface BlockMeta {
  /** 图片地址（data URL 或本地路径） */
  readonly src?: string;
  /** 图片宽度百分比 */
  readonly width?: number;
  /** 表格内容：行 → 单元格文本 */
  readonly rows?: readonly (readonly string[])[];
  /** 表格合并单元格；null 表示被覆盖格 */
  readonly spans?: readonly (readonly (TableCellSpan | null)[])[];
  /** 表格首行是否为表头 */
  readonly header?: boolean;
  /** 表格列宽百分比；缺省时等宽 */
  readonly columnWidths?: readonly number[];
  /** 表格行高（px，作为最小高度）；缺省时按内容 */
  readonly rowHeights?: readonly number[];
  /** 单元格 rows 是否保存富文本 HTML；旧表格缺省为纯文本 */
  readonly richText?: boolean;
  /** 单元格对齐方式；缺省为 left */
  readonly cellAligns?: readonly (readonly CellAlign[])[];
  readonly caption?: string;
  readonly chart?: ChartSpec;
}

export interface Block {
  readonly id: string;
  readonly type: BlockType;
  /** 文本类块的行内 HTML（已清洗的白名单子集）；表格/图片/分割线为空串 */
  readonly html: string;
  readonly align?: 'left' | 'center' | 'right' | 'justify';
  readonly indent?: number;
  readonly fontFamily?: string;
  readonly fontSize?: number;
  readonly meta?: BlockMeta;
}

export interface Group {
  readonly id: string;
  readonly blockIds: readonly string[];
}

export interface TocEntry {
  readonly id: string;
  /** 首块（跳转用） */
  readonly blockId: string;
  /** 整组目录时包含的块；单块目录为空 */
  readonly blockIds: readonly string[];
  readonly label: string;
  readonly parentId: string | null;
  readonly level: number;
  /** 折叠状态（新增功能），随文档保存 */
  readonly collapsed?: boolean;
}

export interface Doc {
  readonly schema: 4;
  readonly title: string;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly blocks: readonly Block[];
  readonly annotations: readonly Annotation[];
  readonly groups: readonly Group[];
  readonly toc: readonly TocEntry[];
}

export function emptyDoc(now = Date.now()): Doc {
  return {
    schema: 4,
    title: '无标题文档',
    createdAt: now,
    updatedAt: now,
    blocks: [createBlock('paragraph')],
    annotations: [],
    groups: [],
    toc: [],
  };
}

let idSeed = 0;

export function uid(prefix = 'b'): string {
  idSeed += 1;
  return `${prefix}_${Date.now().toString(36)}_${idSeed.toString(36)}`;
}

export function createBlock(type: BlockType = 'paragraph', html = ''): Block {
  const base: Block = { id: uid(), type, html };
  if (type === 'table') {
    return {
      ...base,
      meta: { rows: [['', ''], ['', '']], header: true, richText: true },
    };
  }
  if (type === 'image') {
    return { ...base, meta: { width: 100 } };
  }
  if (type === 'chart') {
    return { ...base, meta: { chart: { kind: 'bar', title: '', categories: [], series: [] } } };
  }
  return base;
}
