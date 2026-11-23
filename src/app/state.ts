/**
 * 渲染层共享状态：只存“实例 + 可变的小状态”，不含业务规则。
 * 拆出去的模块统一拿这份 state，避免再各自持有副本。
 */

import type { Doc, Block } from '../core/types.js';
import type { Store } from '../core/store.js';
import type { BlockRenderer } from '../editor/render.js';
import type { OutlineView } from '../ui/outline.js';
import type { SearchPanel } from '../ui/search.js';
import type { CommentsManager } from '../features/comments/controller.js';

export interface AppState {
  readonly store: Store;
  readonly renderer: BlockRenderer;
  readonly blocksHost: HTMLElement;
  readonly workspace: HTMLElement;
  readonly outlineHost: HTMLElement | null;
  readonly statusHost: HTMLElement | null;
  readonly searchHost: HTMLElement | null;
  readonly outlineView: OutlineView;
  readonly comments: CommentsManager;
  readonly searchPanel: SearchPanel | null;
  filePath: string | null;
  dirty: boolean;
  zoom: number;
  pageSize: string;
  lastGroups: Doc['groups'];
  lastAnnotations: Doc['annotations'];
  lastStats: ReturnType<BlockRenderer['render']>;
}

export type Toast = (message: string, duration?: number) => void;

export function activeId(state: AppState): string | null {
  return state.store.selection.activeId ?? state.store.selection.blockIds[0] ?? null;
}

export function activeBlock(state: AppState): Block | undefined {
  const id = activeId(state);
  return id ? state.store.doc.blocks.find((block) => block.id === id) : undefined;
}

export function selectionBlocks(state: AppState): Block[] {
  const ids = new Set(state.store.selection.blockIds);
  return state.store.doc.blocks.filter((block) => ids.has(block.id));
}

export function escapeHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

export function escapeAttr(value: string): string {
  return escapeHtml(value).replaceAll('"', '&quot;');
}
