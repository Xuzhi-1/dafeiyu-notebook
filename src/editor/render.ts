/**
 * 键控渲染器：按 block.id 复用 DOM，只更新发生变化的块。
 *
 * 这是“不跳滚动、不丢选区、大文档不卡”的基础：
 * - 未变化的块节点完全不碰；
 * - 顺序变化时才移动节点；
 * - 块类型变化才重建节点。
 */

import type { Doc } from '../core/types.js';
import type { Block, BlockType } from '../core/types.js';
import { viewFor } from './registry.js';
import { placeBlockExtensions } from './extensions.js';
import { applyTextStyle } from './blocks/text.js';

export interface RenderStats {
  created: number;
  updated: number;
  replaced: number;
  moved: number;
  removed: number;
}

const emptyStats = (): RenderStats => ({ created: 0, updated: 0, replaced: 0, moved: 0, removed: 0 });

/** 文本块样式变化可以立即应用；内容变化仍需等待输入结束。 */
const TEXT_TYPES = new Set<BlockType>(['paragraph', 'quote', 'bullet', 'number']);

function applyActiveTextStyle(el: HTMLElement, block: Block, previous: Block): void {
  if (!TEXT_TYPES.has(block.type)) return;
  if (
    previous.align === block.align
    && previous.indent === block.indent
    && previous.fontFamily === block.fontFamily
    && previous.fontSize === block.fontSize
  ) return;
  applyTextStyle(el, block);
}

/** 每个块左侧的拖拽把手（不属于块内容，方便点击/拖拽） */
function withHandle(el: HTMLElement): HTMLElement {
  if (!el.querySelector(':scope > .block-handle')) {
    const handle = document.createElement('span');
    handle.className = 'block-handle gutter-handle';
    handle.textContent = '';
    handle.setAttribute('aria-hidden', 'true');
    el.insertBefore(handle, el.firstChild);
  }
  return el;
}

export interface RendererOptions {
  /** 每次创建/更新块后调用，用来挂批注徽章等装饰 */
  decorate?: (el: HTMLElement, block: Block) => void;
}

export class BlockRenderer {
  private readonly nodes = new Map<string, HTMLElement>();
  private readonly blocks = new Map<string, Block>();
  private readonly rendered = new Map<string, Block>();
  private readonly deferred = new Set<string>();
  private readonly selected = new Set<string>();
  private order: string[] = [];

  constructor(private readonly host: HTMLElement, private readonly options: RendererOptions = {}) {}

  render(doc: Doc): RenderStats {
    const stats = emptyStats();
    const nextOrder: string[] = [];
    const alive = new Set<string>();

    for (const block of doc.blocks) {
      nextOrder.push(block.id);
      alive.add(block.id);
      const previous = this.blocks.get(block.id);
      let el = this.nodes.get(block.id);

      if (!el) {
        el = withHandle(viewFor(block.type).create(block));
        if (this.selected.has(block.id)) el.classList.add('is-selected');
        this.nodes.set(block.id, el);
        this.rendered.set(block.id, block);
        this.options.decorate?.(el, block);
        stats.created += 1;
      } else if (previous && previous !== block) {
        if (previous.type !== block.type) {
          const fresh = withHandle(viewFor(block.type).create(block));
          if (this.selected.has(block.id)) fresh.classList.add('is-selected');
          el.replaceWith(fresh);
          this.nodes.set(block.id, fresh);
          el = fresh;
          this.rendered.set(block.id, block);
          this.options.decorate?.(el, block);
          stats.replaced += 1;
        } else if (el.contains(document.activeElement)) {
          // 正在输入的块：DOM 是事实来源，不能回写，否则光标会跳（核心约定）
          applyActiveTextStyle(el, block, previous);
          this.deferred.add(block.id);
        } else {
          viewFor(block.type).update(el, block, previous);
          this.rendered.set(block.id, block);
          this.options.decorate?.(el, block);
          stats.updated += 1;
        }
      }
      this.blocks.set(block.id, block);
    }

    if (this.orderChanged(nextOrder)) {
      let previous: HTMLElement | null = null;
      for (const id of nextOrder) {
        const node = this.nodes.get(id);
        if (!node) continue;
        if (previous) {
          if (previous.nextElementSibling !== node) {
            previous.insertAdjacentElement('afterend', node);
            stats.moved += 1;
          }
        } else {
          const first = [...this.host.children].find((el): el is HTMLElement => el instanceof HTMLElement && el.classList.contains('block'));
          if (first) {
            if (first !== node) {
              this.host.insertBefore(node, first);
              stats.moved += 1;
            }
          } else {
            this.host.appendChild(node);
            stats.moved += 1;
          }
        }
        previous = node;
      }
    }

    for (const [id, el] of this.nodes) {
      if (alive.has(id)) continue;
      el.remove();
      this.selected.delete(id);
      this.nodes.delete(id);
      this.blocks.delete(id);
      this.rendered.delete(id);
      stats.removed += 1;
    }

    placeBlockExtensions(this.host);
    this.order = nextOrder;
    return stats;
  }

  nodeFor(id: string): HTMLElement | null {
    return this.nodes.get(id) ?? null;
  }

  /** 选中态属于选区模型，这里只负责把类名投影到 DOM */
  applySelection(blockIds: readonly string[]): void {
    const next = new Set(blockIds);
    for (const id of this.selected) {
      if (!next.has(id)) this.nodes.get(id)?.classList.remove('is-selected');
    }
    for (const id of next) {
      if (!this.selected.has(id)) this.nodes.get(id)?.classList.add('is-selected');
    }
    this.selected.clear();
    for (const id of next) this.selected.add(id);
    document.body.classList.toggle('is-multi-select', next.size > 1);
  }

  /** 只更新指定块的 DOM；用于 patchBlock 快速路径。 */
  updateBlocks(doc: Doc, ids: readonly string[]): RenderStats {
    const stats = emptyStats();
    for (const id of new Set(ids)) {
      const block = doc.blocks.find((item) => item.id === id);
      if (!block) continue;
      const previous = this.blocks.get(id);
      let el = this.nodes.get(id);
      if (!el) {
        el = withHandle(viewFor(block.type).create(block));
        if (this.selected.has(id)) el.classList.add('is-selected');
        this.nodes.set(id, el);
        this.rendered.set(id, block);
        this.options.decorate?.(el, block);
        stats.created += 1;
      } else if (previous && previous !== block) {
        if (previous.type !== block.type) {
          const fresh = withHandle(viewFor(block.type).create(block));
          if (this.selected.has(id)) fresh.classList.add('is-selected');
          el.replaceWith(fresh);
          this.nodes.set(id, fresh);
          this.rendered.set(id, block);
          this.options.decorate?.(fresh, block);
          stats.replaced += 1;
        } else if (el.contains(document.activeElement)) {
          applyActiveTextStyle(el, block, previous);
          this.deferred.add(id);
        } else {
          viewFor(block.type).update(el, block, previous);
          this.rendered.set(id, block);
          this.options.decorate?.(el, block);
          stats.updated += 1;
        }
      }
      this.blocks.set(id, block);
    }
    return stats;
  }

  /** 强制刷新一个块；用于粘贴等程序化更新，绕过“正在输入”延迟。 */
  refreshBlock(id: string): boolean {
    // 只允许刷新被延迟的“正在输入”块，避免把强制更新当成通用入口。
    if (!this.deferred.has(id)) return false;
    const el = this.nodes.get(id);
    const block = this.blocks.get(id);
    const previous = this.rendered.get(id);
    if (!el || !block) return false;
    if (previous?.type !== block.type) {
      const fresh = withHandle(viewFor(block.type).create(block));
      if (this.selected.has(id)) fresh.classList.add('is-selected');
      el.replaceWith(fresh);
      this.nodes.set(id, fresh);
      this.options.decorate?.(fresh, block);
    } else {
      viewFor(block.type).update(el, block, previous);
      this.options.decorate?.(el, block);
    }
    this.rendered.set(id, block);
    this.deferred.delete(id);
    return true;
  }

  clear(): void {
    for (const [, el] of this.nodes) el.remove();
    this.selected.clear();
    this.nodes.clear();
    this.blocks.clear();
    this.rendered.clear();
    this.deferred.clear();
    this.order = [];
  }

  /** 焦点离开后，把输入期间跳过更新的块补上一次 */
  flushDeferred(): void {
    if (!this.deferred.size) return;
    for (const id of [...this.deferred]) {
      const el = this.nodes.get(id);
      const block = this.blocks.get(id);
      const previous = this.rendered.get(id);
      if (!el || !block) { this.deferred.delete(id); continue; }
      if (el.contains(document.activeElement)) continue;
      viewFor(block.type).update(el, block, previous);
      this.rendered.set(id, block);
      this.options.decorate?.(el, block);
      this.deferred.delete(id);
    }
  }

  /** 组标记、批注数这类“块外信息”变化时，统一刷新装饰 */
  redecorateAll(blocks: readonly Block[]): void {
    if (!this.options.decorate) return;
    for (const block of blocks) {
      const el = this.nodes.get(block.id);
      if (el) this.options.decorate(el, block);
    }
  }

  private orderChanged(nextOrder: readonly string[]): boolean {
    if (nextOrder.length !== this.order.length) return true;
    return nextOrder.some((id, index) => id !== this.order[index]);
  }
}
