/**
 * 状态容器：文档 + 选区 + 撤销栈。
 *
 * 唯一写入口是 dispatch()；界面只能“发命令”，不能直接改文档。
 * 撤销用“前后文档引用”入栈：块对象本身是共享的，所以每步只多存两个数组引用，
 * 既简单又不会随文档体积炸开。
 */

import { diffDocs, type DocDiff } from './diff.js';
import { applyOps, type Op } from './ops.js';
import {
  emptySelection, normalizeSelection, sameSelection, type Selection,
} from './selection.js';
import type { Doc } from './types.js';

export type Command = (doc: Doc, selection: Selection) => readonly Op[] | null;

export type StoreEvent =
  | { readonly type: 'doc'; readonly diff: DocDiff }
  | { readonly type: 'patch'; readonly ids: readonly string[] }
  | { readonly type: 'selection'; readonly selection: Selection };

interface HistoryEntry {
  readonly before: Doc;
  readonly after: Doc;
  readonly selectionBefore: Selection;
  readonly selectionAfter: Selection;
}

const MAX_HISTORY = 200;

export class Store {
  private currentDoc: Doc;
  private currentSelection: Selection;
  private undoStack: HistoryEntry[] = [];
  private redoStack: HistoryEntry[] = [];
  private readonly listeners = new Set<(event: StoreEvent) => void>();

  constructor(doc: Doc, selection: Selection = emptySelection) {
    this.currentDoc = doc;
    this.currentSelection = normalizeSelection(selection, doc);
  }

  get doc(): Doc {
    return this.currentDoc;
  }

  get selection(): Selection {
    return this.currentSelection;
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  subscribe(listener: (event: StoreEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  setSelection(selection: Selection): void {
    const next = normalizeSelection(selection, this.currentDoc);
    if (sameSelection(next, this.currentSelection)) return;
    this.currentSelection = next;
    this.emit({ type: 'selection', selection: next });
  }

  /**
   * 执行命令：命令只负责返回操作数组，具体应用、历史、通知都在这里统一做。
   * @returns 是否真的发生了修改
   */
  dispatch(command: Command, selectionAfter?: Selection): boolean {
    const ops = command(this.currentDoc, this.currentSelection);
    if (!ops || !ops.length) return false;
    const next = applyOps(this.currentDoc, ops);
    if (next === this.currentDoc) return false;

    const patchIds = ops.every((op) => op.t === 'patchBlock')
      ? [...new Set(ops.map((op) => op.id))]
      : null;
    const diff = patchIds ? null : diffDocs(this.currentDoc, next);
    const stamped: Doc = { ...next, updatedAt: Date.now() };
    const nextSelection = normalizeSelection(
      selectionAfter ?? this.currentSelection,
      stamped,
    );

    this.undoStack.push({
      before: this.currentDoc,
      after: stamped,
      selectionBefore: this.currentSelection,
      selectionAfter: nextSelection,
    });
    if (this.undoStack.length > MAX_HISTORY) this.undoStack.shift();
    this.redoStack = [];

    this.currentDoc = stamped;
    this.currentSelection = nextSelection;
    if (patchIds) this.emit({ type: 'patch', ids: patchIds });
    else this.emit({ type: 'doc', diff: diff! });
    this.emit({ type: 'selection', selection: nextSelection });
    return true;
  }

  /**
   * 表格编辑后离开选区时，第一次 Ctrl+Z 只恢复表格区块选区，不撤销文本。
   * 下一次 Ctrl+Z 才执行真正的文档撤销。
   */
  undoSelectionOnly(): boolean {
    const entry = this.undoStack[this.undoStack.length - 1];
    if (!entry || sameSelection(this.currentSelection, entry.selectionBefore)) return false;
    const tableSelected = entry.selectionBefore.blockIds.some((id) => (
      entry.before.blocks.find((block) => block.id === id)?.type === 'table'
    ));
    if (!tableSelected) return false;
    this.currentSelection = normalizeSelection(entry.selectionBefore, this.currentDoc);
    this.emit({ type: 'selection', selection: this.currentSelection });
    return true;
  }

  undo(): boolean {
    const entry = this.undoStack.pop();
    if (!entry) return false;
    this.redoStack.push(entry);
    const previous = this.currentDoc;
    this.currentDoc = entry.before;
    this.currentSelection = normalizeSelection(entry.selectionBefore, entry.before);
    this.emit({ type: 'doc', diff: diffDocs(previous, this.currentDoc) });
    this.emit({ type: 'selection', selection: this.currentSelection });
    return true;
  }

  redo(): boolean {
    const entry = this.redoStack.pop();
    if (!entry) return false;
    this.undoStack.push(entry);
    const previous = this.currentDoc;
    this.currentDoc = entry.after;
    this.currentSelection = normalizeSelection(entry.selectionAfter, entry.after);
    this.emit({ type: 'doc', diff: diffDocs(previous, this.currentDoc) });
    this.emit({ type: 'selection', selection: this.currentSelection });
    return true;
  }

  /** 载入新文档（打开文件 / 迁移），清空历史 */
  replaceDoc(doc: Doc, selection: Selection = emptySelection): void {
    const previous = this.currentDoc;
    this.currentDoc = doc;
    this.currentSelection = normalizeSelection(selection, doc);
    this.undoStack = [];
    this.redoStack = [];
    this.emit({ type: 'doc', diff: diffDocs(previous, doc) });
    this.emit({ type: 'selection', selection: this.currentSelection });
  }

  private emit(event: StoreEvent): void {
    for (const listener of this.listeners) listener(event);
  }
}

export type { DocDiff };
