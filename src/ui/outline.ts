/**
 * 目录侧栏视图：只负责渲染与交互事件，所有修改通过回调交给 app 层 dispatch。
 * 落点规则（R6）：上 30% 插前、下 30% 插后、中间 40% 成为子级。
 */

import { buildOutline } from '../core/decorate.js';
import { entrySubtreeIds } from '../core/toc.js';
import { openContextMenu } from './contextMenu.js';
import type { Doc, TocEntry } from '../core/types.js';
import { t } from '../i18n/index.js';

export type DropPosition = 'before' | 'after' | 'inside';

export interface OutlineHandlers {
  onJump(entry: TocEntry): void;
  onToggle(entry: TocEntry): void;
  onRename(entry: TocEntry, label: string): void;
  onRemove(entryIds: readonly string[]): boolean;
  onMove(entryIds: readonly string[], target: TocEntry, position: DropPosition): boolean;
  onMoveToEnd(entryIds: readonly string[]): boolean;
}

const escapeHtml = (value: string): string => value
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

interface DropTarget {
  readonly hit: HTMLElement;
  readonly position: DropPosition;
}

const DROP_BEFORE = 0.3;
const DROP_AFTER = 0.7;

function isOverTail(event: PointerEvent): boolean {
  return event.target instanceof Element && Boolean(event.target.closest('[data-toc-tail]'));
}

/** 根据指针在目标目录项中的纵向位置计算 before / after / inside。 */
function dropTargetAt(event: PointerEvent): DropTarget | null {
  const target = event.target;
  if (!(target instanceof Element)) return null;
  const hit = target.closest<HTMLElement>('[data-toc-id]');
  if (!hit) return null;
  const rect = hit.getBoundingClientRect();
  const ratio = (event.clientY - rect.top) / Math.max(1, rect.height);
  return {
    hit,
    position: ratio < DROP_BEFORE ? 'before' : ratio > DROP_AFTER ? 'after' : 'inside',
  };
}

export class OutlineView {
  private selected = new Set<string>();
  private drag: { entry: TocEntry; ids: string[]; pointerId: number } | null = null;

  constructor(
    private readonly host: HTMLElement,
    private readonly handlers: OutlineHandlers,
  ) {
    this.host.addEventListener('click', this.onClick);
    this.host.addEventListener('dblclick', this.onDoubleClick);
    this.host.addEventListener('pointerdown', this.onPointerDown);
    this.host.addEventListener('contextmenu', this.onContextMenu);
  }

  render(doc: Doc): void {
    this.currentDoc = doc;
    const outline = buildOutline(doc);
    if (!outline.total) {
      this.host.innerHTML = `<h2>${t('目录')}</h2><p class="outline-empty">${t('把块加入目录后，会在这里出现。')}</p>`;
      return;
    }
    const items = outline.nodes.map((node) => {
      const { entry, depth, hasChildren } = node;
      const toggleLabel = entry.collapsed ? t('展开') : t('折叠');
      const chevron = hasChildren
        ? `<button class="toc-chevron${entry.collapsed ? ' is-collapsed' : ''}" data-toc-toggle="${escapeHtml(entry.id)}" title="${toggleLabel}" aria-label="${toggleLabel}"></button>`
        : '<span class="toc-chevron-placeholder"></span>';
      return `
        <div class="toc-item${entry.collapsed ? ' is-collapsed' : ''}" data-toc-id="${escapeHtml(entry.id)}" data-depth="${depth}" style="--depth: ${depth}">
          <span class="toc-level" aria-hidden="true">${depth + 1}</span>
          ${chevron}
          <span class="toc-handle" data-toc-handle="${escapeHtml(entry.id)}" title="${t('拖动排序 / 调整层级')}" aria-hidden="true"></span>
          <span class="toc-text">
            <span class="toc-label" data-toc-label="${escapeHtml(entry.id)}">${escapeHtml(entry.label)}</span>
          </span>
        </div>`;
    }).join('');
    this.host.innerHTML = `<h2>${t('目录 {count}', { count: outline.total })}</h2>${items}<div class="toc-tail" data-toc-tail>${t('＋ 拖到这里加到目录末尾')}</div>`;
    const ids = new Set(doc.toc.map((entry) => entry.id));
    for (const id of [...this.selected]) {
      if (!ids.has(id)) {
        this.selected.delete(id);
        continue;
      }
      for (const child of entrySubtreeIds(doc, id)) this.selected.add(child);
    }
    this.paintSelection();
  }

  private entryFrom(target: EventTarget | null): TocEntry | null {
    const el = target instanceof Element ? target.closest<HTMLElement>('[data-toc-id]') : null;
    const id = el?.dataset.tocId;
    if (!id) return null;
    return this.currentDoc?.toc.find((entry) => entry.id === id) ?? null;
  }

  private currentDoc: Doc | null = null;

  setDoc(doc: Doc): void {
    this.currentDoc = doc;
    this.render(doc);
  }

  private hasSelectedAncestor(entryId: string): boolean {
    const doc = this.currentDoc;
    if (!doc) return false;
    let cursor = doc.toc.find((entry) => entry.id === entryId)?.parentId ?? null;
    let guard = 0;
    while (cursor && guard < 64) {
      if (this.selected.has(cursor)) return true;
      cursor = doc.toc.find((entry) => entry.id === cursor)?.parentId ?? null;
      guard += 1;
    }
    return false;
  }

  private paintSelection(): void {
    this.host.querySelectorAll<HTMLElement>('.toc-item[data-toc-id]').forEach((item) => {
      const id = item.dataset.tocId;
      item.classList.toggle('is-selected', Boolean(id && this.selected.has(id)));
    });
  }

  /** 清除目录选择。 */
  clear(): void {
    this.clearSelection();
  }

  /** Ctrl+A：选中全部目录项，包括折叠中的子项。 */
  selectAll(): void {
    const doc = this.currentDoc;
    if (!doc) return;
    this.selected = new Set(doc.toc.map((entry) => entry.id));
    this.paintSelection();
  }

  private clearSelection(): void {
    if (!this.selected.size) return;
    this.selected.clear();
    this.paintSelection();
  }

  private toggleSelection(entry: TocEntry): void {
    const doc = this.currentDoc;
    if (!doc) return;
    if (this.hasSelectedAncestor(entry.id)) return;
    const ids = entrySubtreeIds(doc, entry.id);
    if (this.selected.has(entry.id)) {
      for (const id of ids) this.selected.delete(id);
    } else {
      for (const id of ids) this.selected.add(id);
    }
    this.paintSelection();
  }


  private onClick = (event: MouseEvent): void => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const toggle = target.closest<HTMLElement>('[data-toc-toggle]');
    if (toggle) {
      event.stopPropagation();
      const entry = this.entryFrom(toggle);
      if (entry) this.handlers.onToggle(entry);
      return;
    }
    if (target.closest('.toc-handle')) return;
    const entry = this.entryFrom(target);
    if (!entry) return;
    if (event.altKey) {
      event.preventDefault();
      this.toggleSelection(entry);
      return;
    }
    this.clearSelection();
    this.handlers.onJump(entry);
  };

  private onContextMenu = (event: MouseEvent): void => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const entry = this.entryFrom(target);
    if (!entry) return;
    event.preventDefault();
    if (!this.selected.has(entry.id)) {
      this.selected.clear();
      for (const id of entrySubtreeIds(this.currentDoc!, entry.id)) this.selected.add(id);
      this.paintSelection();
    }
    const ids = [...this.selected];
    openContextMenu([
      {
        label: ids.length > 1 ? t('删除 {count} 个目录', { count: ids.length }) : t('删除此目录'),
        danger: true,
        onSelect: () => {
          if (this.handlers.onRemove(ids)) this.clearSelection();
        },
      },
    ], event.clientX, event.clientY);
  };

  private onDoubleClick = (event: MouseEvent): void => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const label = target.closest<HTMLElement>('[data-toc-label]');
    if (!label) return;
    const entry = this.entryFrom(label);
    if (!entry) return;
    const original = label.textContent ?? '';
    label.contentEditable = 'true';
    label.focus();
    const range = document.createRange();
    range.selectNodeContents(label);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    const commit = (): void => {
      label.contentEditable = 'false';
      const text = (label.textContent ?? '').trim();
      if (text && text !== original) this.handlers.onRename(entry, text);
      else label.textContent = original;
      label.removeEventListener('blur', commit);
      label.removeEventListener('keydown', onKey);
    };
    const onKey = (keyEvent: KeyboardEvent): void => {
      if (keyEvent.key === 'Enter') { keyEvent.preventDefault(); commit(); }
      if (keyEvent.key === 'Escape') { label.textContent = original; commit(); }
    };
    label.addEventListener('blur', commit);
    label.addEventListener('keydown', onKey);
  };

  private onPointerDown = (event: PointerEvent): void => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (event.button === 0 && (event.shiftKey || event.altKey)) {
      window.getSelection()?.removeAllRanges();
      event.preventDefault();
    }
    const handle = target.closest<HTMLElement>('[data-toc-handle]');
    if (!handle || event.button !== 0) return;
    const entry = this.entryFrom(handle);
    if (!entry) return;
    event.preventDefault();
    const ids = this.selected.has(entry.id) && this.selected.size > 1 ? [...this.selected] : [entry.id];
    this.drag = { entry, ids, pointerId: event.pointerId };
    this.host.classList.add('is-dragging');
    const move = (moveEvent: PointerEvent): void => {
      if (!this.drag) return;
      this.host.querySelectorAll('.toc-item').forEach((el) => el.classList.remove('drop-before', 'drop-after', 'drop-inside'));
      const tail = this.host.querySelector<HTMLElement>('[data-toc-tail]');
      const overTail = isOverTail(moveEvent);
      tail?.classList.toggle('is-active', overTail);
      if (overTail) return;
      const drop = dropTargetAt(moveEvent);
      if (!drop) return;
      const id = drop.hit.dataset.tocId;
      if (!id || id === this.drag.entry.id) return;
      drop.hit.classList.add(`drop-${drop.position}`);
    };
    const finish = (upEvent: PointerEvent): void => {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', finish);
      document.removeEventListener('pointercancel', finish);
      this.host.classList.remove('is-dragging');
      const dragged = this.drag?.entry ?? null;
      const ids = this.drag?.ids ?? (dragged ? [dragged.id] : []);
      this.drag = null;
      const tail = this.host.querySelector<HTMLElement>('[data-toc-tail]');
      const overTail = isOverTail(upEvent);
      tail?.classList.remove('is-active');
      this.host.querySelectorAll('.drop-before, .drop-after, .drop-inside').forEach((el) => el.classList.remove('drop-before', 'drop-after', 'drop-inside'));
      if (!dragged) return;
      if (overTail) {
        const moved = this.handlers.onMoveToEnd(ids);
        if (moved && ids.length > 1) this.clearSelection();
        return;
      }
      const drop = dropTargetAt(upEvent);
      if (!drop) return;
      const targetEntry = this.entryFrom(drop.hit);
      if (!targetEntry || ids.includes(targetEntry.id)) return;
      const moved = this.handlers.onMove(ids, targetEntry, drop.position);
      if (moved && ids.length > 1) this.clearSelection();
    };
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', finish);
    document.addEventListener('pointercancel', finish);
  };
}
