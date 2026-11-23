/**
 * 块视图注册表：新增一种块 = 新增一个视图文件 + 在这里注册一行，核心不用改。
 */

import type { Block, BlockType } from '../core/types.js';
import { createChartView, updateChartView } from './blocks/chart.js';
import { createDividerView } from './blocks/divider.js';
import { createImageView, updateImageView } from './blocks/image.js';
import { applyTableSizing, createTableView, renderTable } from './blocks/table.js';
import { applyTextStyle, createTextView } from './blocks/text.js';
import { sanitizeInline } from './sanitize.js';

export interface BlockView {
  /** 创建块的 DOM */
  create(block: Block): HTMLElement;
  /** 用新数据更新已有 DOM（只有内容真的变了才会被调用） */
  update(el: HTMLElement, block: Block, previous: Block | undefined): void;
}

const textView: BlockView = {
  create: (block) => createTextView(block),
  update: (el, block, previous) => {
    if (previous?.html !== block.html) {
      const content = el.querySelector<HTMLElement>('.block-content');
      if (content) content.innerHTML = sanitizeInline(block.html);
    }
    if (previous?.align !== block.align || previous?.indent !== block.indent || previous?.fontFamily !== block.fontFamily || previous?.fontSize !== block.fontSize) {
      applyTextStyle(el, block);
    }
  },
};

export const blockViews: Record<BlockType, BlockView> = {
  paragraph: textView,
  quote: textView,
  bullet: textView,
  number: textView,
  table: {
    create: (block) => createTableView(block),
    update: (el, block, previous) => {
      const previousRows = previous?.meta?.rows;
      const rows = block.meta?.rows ?? [];
      if (!previousRows || previous?.meta?.header !== block.meta?.header || previous?.meta?.richText !== block.meta?.richText
        || JSON.stringify(previous?.meta?.spans ?? null) !== JSON.stringify(block.meta?.spans ?? null)) {
        renderTable(el, block);
        return;
      }
      const sameShape = previousRows.length === rows.length
        && previousRows.every((row, index) => row.length === rows[index]?.length);
      if (!sameShape) {
        renderTable(el, block);
        return;
      }
      rows.forEach((row, rowIndex) => {
        row.forEach((text, columnIndex) => {
          if (block.meta?.spans) {
            if (!block.meta.spans[rowIndex]?.[columnIndex]) return;
          }
          const cell = el.querySelector<HTMLElement>(
            `td[data-row="${rowIndex}"][data-column="${columnIndex}"], th[data-row="${rowIndex}"][data-column="${columnIndex}"]`,
          );
          if (!cell) return;
          const next = block.meta?.richText ? sanitizeInline(text) : text;
          if (block.meta?.richText ? cell.innerHTML !== next : cell.textContent !== next) {
            if (block.meta?.richText) cell.innerHTML = next;
            else cell.textContent = next;
          }
        });
      });
      applyTableSizing(el, block);
    },
  },
  image: {
    create: (block) => createImageView(block),
    update: (el, block, previous) => updateImageView(el, block, previous),
  },
  divider: {
    create: (block) => createDividerView(block),
    update: () => {},
  },
  chart: {
    create: (block) => createChartView(block),
    update: (el, block, previous) => updateChartView(el, block, previous),
  },
};

export function viewFor(type: BlockType): BlockView {
  return blockViews[type] ?? blockViews.paragraph;
}
