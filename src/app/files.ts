/**
 * 文件相关动作：新建 / 打开 / 最近 / 保存 / 另存 / 导入 / 导出 / 打印。
 * 只通过 platform() 访问系统能力；不直接碰 Node。
 */

import { createDoc, docFromRaw, docToV2 } from '../core/doc.js';
import { blocksFromText } from '../core/import.js';
import { blocksFromHtml } from '../editor/htmlImport.js';
import { docToExportHtml } from '../core/export.js';
import { platform, type ImportedText } from '../platform/ipc.js';
import type { Doc } from '../core/types.js';
import { escapeAttr, escapeHtml, type AppState, type Toast } from './state.js';
import { flushDocumentEditing, resetDocumentEditing } from './editorCommands.js';
import { t } from '../i18n/index.js';

export interface FileDeps {
  state: AppState;
  refreshChrome: () => void;
  toast: Toast;
}

export interface FileActions {
  loadDocData(data: unknown, path: string | null): void;
  openPath(path: string): Promise<boolean>;
  openDialog(): Promise<void>;
  openInNewWindow(path?: string): Promise<boolean>;
  newDocument(): Promise<void>;
  importText(): Promise<void>;
  printDocument(): Promise<void>;
  refreshRecent(): Promise<void>;
  serialize(): unknown;
  save(): Promise<boolean>;
  saveAs(): Promise<boolean>;
  exportDocx(size?: string): Promise<unknown>;
  exportPdf(size?: string): Promise<unknown>;
}

export function createFiles({ state, refreshChrome, toast }: FileDeps): FileActions {
  const { store, renderer } = state;

  const confirmDiscard = (): boolean => !state.dirty
    || localStorage.getItem('dafeiyu-next.skip-confirm') === '1'
    || window.confirm(t('当前文档还有未保存的修改，确定要丢弃吗？'));

  function loadDocData(data: unknown, path: string | null): void {
    flushDocumentEditing(state);
    resetDocumentEditing(state);
    store.replaceDoc(docFromRaw(data, store.doc.title));
    renderer.clear();
    renderer.render(store.doc);
    state.outlineView.render(store.doc);
    state.comments.reset();
    state.comments.sync();
    state.searchPanel?.refresh();
    state.filePath = path;
    platform()?.setDocumentPath(path);
    state.dirty = false;
    refreshChrome();
  }

  async function openPath(path: string): Promise<boolean> {
    const api = platform();
    if (!api) return false;
    if (!confirmDiscard()) return false;
    try {
      const payload = await api.readPath(path);
      loadDocData(payload.data, payload.path);
      void api.recentAdd({ path: payload.path, title: store.doc.title });
      return true;
    } catch {
      toast(t('打开文档失败，文件可能已损坏或路径不可用'));
      return false;
    }
  }

  async function openDialog(): Promise<void> {
    const api = platform();
    if (!api) return;
    if (!confirmDiscard()) return;
    try {
      const payload = await api.openFile();
      if (payload) loadDocData(payload.data, payload.path);
    } catch {
      toast(t('打开文档失败，文件可能已损坏'));
    }
  }

  async function openInNewWindow(): Promise<boolean> {
    return (await platform()?.openFileInNewWindow()) ?? false;
  }

  function serialize(): unknown {
    return docToV2(store.doc);
  }

  async function save(): Promise<boolean> {
    const api = platform();
    if (!api) return false;
    flushDocumentEditing(state);
    if (!state.filePath) return saveAs();
    const revision = store.doc.updatedAt;
    try {
      const result = await api.save(state.filePath, serialize());
      if (result.error) {
        toast(t('保存失败：{error}', { error: result.error }));
        return false;
      }
      if (store.doc.updatedAt === revision) state.dirty = false;
      refreshChrome();
      return true;
    } catch {
      toast(t('保存失败，文件未被修改'));
      return false;
    }
  }

  async function saveAs(): Promise<boolean> {
    const api = platform();
    if (!api) return false;
    flushDocumentEditing(state);
    const revision = store.doc.updatedAt;
    try {
      const result = await api.saveAs(serialize(), store.doc.title);
      if (result.canceled) return false;
      if (result.error || !result.path) {
        toast(t('保存失败：{error}', { error: result.error || t('未返回文件路径') }));
        return false;
      }
      state.filePath = result.path;
      platform()?.setDocumentPath(result.path);
      if (store.doc.updatedAt === revision) state.dirty = false;
      void api.recentAdd({ path: result.path, title: store.doc.title });
      refreshChrome();
      return true;
    } catch {
      toast(t('保存失败，文件未被修改'));
      return false;
    }
  }

  async function newDocument(): Promise<void> {
    if (!confirmDiscard()) return;
    loadDocData(docToV2(createDoc(t('无标题文档'))), null);
    state.dirty = false;
    refreshChrome();
  }

  async function importText(): Promise<void> {
    const api = platform();
    if (!api) return;
    if (!confirmDiscard()) return;
    let imported: ImportedText | null;
    try {
      imported = await api.importText();
    } catch {
      toast(t('导入失败，无法读取文件'));
      return;
    }
    if (!imported) return;
    const blocks = imported.kind === 'docx' && imported.html
      ? blocksFromHtml(imported.html)
      : blocksFromText(imported.content ?? '');
    const doc: Doc = { ...createDoc(imported.name), blocks };
    loadDocData(docToV2(doc), null);
    state.dirty = true;
    refreshChrome();
  }

  async function printDocument(): Promise<void> {
    const api = platform();
    if (!api) return;
    const result = await api.print();
    if (!result.ok && result.reason) toast(t('打印失败：{reason}', { reason: result.reason }));
  }

  async function refreshRecent(): Promise<void> {
    const list = await window.moye?.recentList?.() ?? [];
    const host = document.querySelector<HTMLElement>('#recent-list');
    if (!host) return;
    host.innerHTML = list.length
      ? list.map((item) => `<button type="button" class="recent-item" data-recent-path="${escapeAttr(item.path)}"><span class="recent-name">${escapeHtml(item.title || item.path)}</span><span class="recent-path">${escapeHtml(item.path)}</span></button>`).join('')
      : `<p class="recent-empty">${t('还没有打开过文档。')}</p>`;
  }

  async function exportDocx(size = state.pageSize): Promise<unknown> {
    const api = platform();
    if (!api) return null;
    flushDocumentEditing(state);
    return api.exportDocx(docToExportHtml(store.doc, size), store.doc.title, size);
  }

  async function exportPdf(size = state.pageSize): Promise<unknown> {
    const api = platform();
    if (!api) return null;
    flushDocumentEditing(state);
    return api.exportPdf(store.doc.title, size);
  }

  return {
    loadDocData,
    openPath,
    openDialog,
    openInNewWindow,
    newDocument,
    importText,
    printDocument,
    refreshRecent,
    serialize,
    save,
    saveAs,
    exportDocx,
    exportPdf,
  };
}
