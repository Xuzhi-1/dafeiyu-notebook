/**
 * 渲染层入口：只负责装配实例、状态与模块。
 * 具体动作在 app/blockActions、app/editorRuntime、app/windowChrome。
 */

import { createDoc, docFromRaw, docToV2 } from '../core/doc.js';
import { countDocumentContent } from '../core/textStats.js';
import { selectMany } from '../core/selection.js';
import { Store } from '../core/store.js';
import {
  moveEntries, moveEntriesToEnd, moveEntry, moveEntryToEnd, removeEntries, removeEntry, renameEntry, tocOp, toggleCollapse,
} from '../core/toc.js';
import type { Doc } from '../core/types.js';
import type { SearchCell } from '../core/search.js';
import { BlockRenderer } from '../editor/render.js';
import { jumpToBlock as jumpToBlockElement, jumpToEntry } from '../editor/scroll.js';
import { createComments } from '../features/comments/controller.js';
import { createSearchCommentPort } from '../features/comments/searchPort.js';
import { installImageEditing } from '../features/image/index.js';
import { installTableFeature } from '../features/table/index.js';
import { installChartFeature } from '../features/chart/index.js';
import { installBlockContextMenu } from '../features/blocks/contextMenu.js';
import { installMixedPaste } from '../features/paste/mixed.js';
import { installPanelKeyboardGuard } from '../app/panelKeyboardGuard.js';
import { openImageMenu } from '../features/image/menu.js';
import { MenuController } from '../ui/menus.js';
import { OutlineView } from '../ui/outline.js';
import { SearchPanel } from '../ui/search.js';
import { applyTheme, loadTheme } from '../ui/theme.js';
import { installColorPalettes } from '../ui/colorPalette.js';
import { installFontLibrary } from '../ui/fontLibrary.js';
import { renderIcons } from '../ui/icons.js';
import { platform } from '../platform/ipc.js';
import { createBlockActions } from '../app/blockActions.js';
import { installMcpBridge } from '../app/mcpBridge.js';
import { installDshPanel } from '../dsh/panel.js';
import { createBlockDecorator } from '../app/commentWiring.js';
import { installEditorRuntime } from '../app/editorRuntime.js';
import { createFiles } from '../app/files.js';
import { createPlugins, createToast, maybeShowAltHint } from '../app/plugins.js';
import { createView, installViewUi } from '../app/view.js';
import { installOutlineResizer } from '../app/outlineResizer.js';
import { installSearchLayout } from '../app/searchLayout.js';
import { installTitlebarSearch } from '../app/titlebarSearch.js';
import { installWindowChrome } from '../app/windowChrome.js';
import { installFileDrop } from '../app/fileDrop.js';
import { installFontPreferenceSync } from '../app/fontPreferenceSync.js';
import { insertDroppedImages } from '../features/image/drop.js';
import type { AppState } from '../app/state.js';
import { installTesting } from '../app/testing.js';
import { installShortcuts } from '../app/shortcuts.js';
import { flushDocumentEditing } from '../app/editorCommands.js';
import { installToolbar } from '../app/toolbar.js';
import { installAbout } from '../app/about.js';
import { getLocale, installI18n, onBeforeLocaleChange, t } from '../i18n/index.js';

installI18n();

const IMAGE_DOT = 'data:image/svg+xml;utf8,'
  + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="160" height="90"><rect width="160" height="90" fill="#dbe4ff"/><text x="80" y="52" text-anchor="middle" font-size="14" fill="#4d6bfe">图片块</text></svg>');

const demoDoc: Doc = docFromRaw({
  title: '重写验证文档',
  blocks: [
    { id: 'b1', type: 'p', html: '第一个块：这段文字来自核心模型。' },
    { id: 'b2', type: 'p', html: '<b>第二个块</b>：加粗由行内 HTML 表达。' },
    { id: 'b3', type: 'quote', html: '第三个块：引用。' },
    { id: 'b4', type: 'table', meta: { rows: [['名字', '数量'], ['洛斯里克', '1'], ['余灰', '2']], header: true } },
    { id: 'b5', type: 'image', meta: { src: IMAGE_DOT, width: 60 } },
    { id: 'b6', type: 'divider' },
    { id: 'b7', type: 'p', html: '最后一个块：用于验证目录与滚动。' },
  ],
  toc: [
    { id: 't1', blockId: 'b1', blockIds: [], label: '第一个块', parentId: null, level: 0 },
    { id: 't2', blockId: 'b7', blockIds: [], label: '最后一个块', parentId: null, level: 0 },
  ],
});

/* ------------------------------------------------------------ 实例 */

const RELOAD_SNAPSHOT = 'dafeiyu.reload-doc';

async function loadStartupDoc(): Promise<{ doc: Doc; path: string | null; error: string; dirty: boolean }> {
  const snapshot = sessionStorage.getItem(RELOAD_SNAPSHOT);
  if (snapshot) {
    sessionStorage.removeItem(RELOAD_SNAPSHOT);
    try {
      const saved = JSON.parse(snapshot) as { data?: unknown; path?: string | null; dirty?: boolean };
      if (saved.data) {
        return { doc: docFromRaw(saved.data, t('无标题文档')), path: saved.path ?? null, error: '', dirty: Boolean(saved.dirty) };
      }
    } catch {
      /* 快照损坏时回退到正常启动 */
    }
  }
  const api = platform();
  const startupPath = await api?.takeStartupPath?.() ?? null;
  const packaged = await api?.info?.().then((info) => info.isPackaged).catch(() => false) ?? false;
  const fallback = (): Doc => (packaged ? createDoc(t('无标题文档')) : demoDoc);
  if (!startupPath || !api) return { doc: fallback(), path: null, error: '', dirty: false };
  try {
    const payload = await api.readPath(startupPath);
    return { doc: docFromRaw(payload.data, t('无标题文档')), path: payload.path, error: '', dirty: false };
  } catch {
    return { doc: fallback(), path: null, error: t('打开文档失败，文件可能已损坏或路径不可用'), dirty: false };
  }
}

const startup = await loadStartupDoc();
const store = new Store(startup.doc);
const blocksHost = document.querySelector<HTMLElement>('#blocks') ?? document.body;
const outlineHost = document.querySelector<HTMLElement>('#outline');
const statusHost = document.querySelector<HTMLElement>('#status');
const searchHost = document.querySelector<HTMLElement>('#search');
const workspace = document.querySelector<HTMLElement>('#workspace') ?? document.body;

const renderer = new BlockRenderer(blocksHost, {
  decorate: createBlockDecorator(store),
});

function focusSearchCell(blockId: string, cell: SearchCell): void {
  window.setTimeout(() => {
    const cellEl = blocksHost.querySelector<HTMLElement>(
      `.block[data-id="${blockId}"] .doc-table td[data-row="${cell.row}"][data-column="${cell.column}"]`,
    );
    if (!cellEl) return;
    cellEl.focus({ preventScroll: true });
    const area = workspace.getBoundingClientRect();
    const rect = cellEl.getBoundingClientRect();
    if (rect.top < area.top || rect.bottom > area.bottom) {
      cellEl.scrollIntoView({ block: 'nearest' });
    }
  });
}

function jumpToBlock(blockId: string, cell?: SearchCell): void {
  const entry = store.doc.toc.find((item) => item.blockId === blockId || item.blockIds.includes(blockId));
  if (entry) {
    const ids = entry.blockIds.length ? entry.blockIds : [entry.blockId];
    store.setSelection(selectMany(ids));
    jumpToEntry(entry, workspace);
    if (cell) focusSearchCell(blockId, cell);
    return;
  }
  if (!jumpToBlockElement(blockId, workspace)) return;
  store.setSelection(selectMany([blockId]));
  if (cell) focusSearchCell(blockId, cell);
}

const comments = createComments({
  store,
  blocksHost,
  openImageMenu: (target, x, y) => openImageMenu(target, x, y, () => {}),
});
const titleSearchInput = document.querySelector<HTMLInputElement>('#titlebar-search-input');
const searchPanel = searchHost
  ? new SearchPanel(searchHost, store, jumpToBlock, {
      externalInput: titleSearchInput ?? undefined,
      comments: createSearchCommentPort(),
    })
  : null;

const outlineView = new OutlineView(outlineHost ?? document.body, {
  onJump: (entry) => {
    const ids = entry.blockIds.length ? entry.blockIds : [entry.blockId];
    store.setSelection(selectMany(ids));
    jumpToEntry(entry, workspace);
  },
  onToggle: (entry) => store.dispatch(() => tocOp(toggleCollapse(store.doc, entry.id))),
  onRename: (entry, label) => store.dispatch(() => tocOp(renameEntry(store.doc, entry.id, label))),
  onRemove: (ids) => store.dispatch(() => tocOp(
    ids.length === 1 ? removeEntry(store.doc, ids[0]) : removeEntries(store.doc, ids),
  )),
  onMove: (ids, target, position) => store.dispatch(() => tocOp(
    ids.length === 1
      ? moveEntry(store.doc, ids[0], target.id, position)
      : moveEntries(store.doc, ids, target.id, position),
  )),
  onMoveToEnd: (ids) => store.dispatch(() => tocOp(
    ids.length === 1 ? moveEntryToEnd(store.doc, ids[0]) : moveEntriesToEnd(store.doc, ids),
  )),
});

const state: AppState = {
  store,
  renderer,
  blocksHost,
  workspace,
  outlineHost,
  statusHost,
  searchHost,
  outlineView,
  comments,
  searchPanel,
  filePath: startup.path,
  dirty: Boolean(startup.dirty),
  zoom: Number(localStorage.getItem('dafeiyu-next.zoom') || 1),
  pageSize: localStorage.getItem('dafeiyu-next.page-size') || 'A4',
  lastGroups: store.doc.groups,
  lastAnnotations: store.doc.annotations,
  lastStats: { created: 0, updated: 0, replaced: 0, moved: 0, removed: 0 },
};

onBeforeLocaleChange(() => {
  try {
    flushDocumentEditing(state);
    sessionStorage.setItem(RELOAD_SNAPSHOT, JSON.stringify({
      data: docToV2(store.doc),
      path: state.filePath,
      dirty: state.dirty,
    }));
    return true;
  } catch {
    return false;
  }
});

let statsDoc: Doc | null = null;
let statsCount = 0;

function contentCount(): number {
  if (statsDoc !== store.doc) {
    statsDoc = store.doc;
    statsCount = countDocumentContent(store.doc);
  }
  return statsCount;
}

/* ------------------------------------------------------------ chrome */

function refreshChrome(): void {
  const undoButton = document.querySelector<HTMLButtonElement>('#btn-undo');
  const redoButton = document.querySelector<HTMLButtonElement>('#btn-redo');
  if (undoButton) undoButton.disabled = !store.canUndo;
  if (redoButton) redoButton.disabled = !store.canRedo;
  const titlebar = document.querySelector<HTMLElement>('#titlebar-title');
  if (titlebar) {
    const fileName = state.filePath?.split(/[\\/]/).pop()?.trim() || store.doc.title || t('无标题文档');
    const title = `${t('大肥鱼笔记本')} — ${fileName}${state.dirty ? ' •' : ''}`;
    titlebar.textContent = title;
    if (document.title !== title) document.title = title;
  }
  const saveState = document.querySelector<HTMLElement>('#save-state');
  if (saveState) saveState.textContent = t(state.dirty ? '未保存' : '已保存');
  if (statusHost) {
    const selectedGroups = store.doc.groups.filter((group) => group.blockIds.length
      && group.blockIds.every((id) => store.selection.blockIds.includes(id)));
    const groupText = selectedGroups.length
      ? t(' · 整组 {count} 块', { count: selectedGroups.reduce((total, group) => total + group.blockIds.length, 0) })
      : '';
    const numberLocale = getLocale() === 'en' ? 'en-US' : 'zh-CN';
    statusHost.textContent = t('块 {count} · 字数 {words} · 选中 {selected}', {
      count: store.doc.blocks.length,
      words: contentCount().toLocaleString(numberLocale),
      selected: store.selection.blockIds.length,
    }) + groupText + (state.filePath ? ` · ${state.filePath}` : '');
    statusHost.title = t('正文/注释按字数，表格按已填写单元格，图表按个');
  }
  window.moye?.setDirty?.(state.dirty);
}

/* ------------------------------------------------------------ 模块装配 */

const toast = createToast();
const files = createFiles({ state, refreshChrome, toast });
const view = createView(state);
installViewUi(state, view);
installOutlineResizer();
installSearchLayout();
installTitlebarSearch(searchPanel, titleSearchInput);
const plugins = createPlugins(state, toast);

const menus = new MenuController({
  fileMenu: document.querySelector<HTMLElement>('#file-menu'),
  moreMenu: document.querySelector<HTMLElement>('#more-menu'),
  fileButton: document.querySelector<HTMLElement>('#btn-file'),
  moreButton: document.querySelector<HTMLElement>('#btn-more'),
  onFileMenuOpen: () => { void files.refreshRecent(); },
});

const actions = createBlockActions(state);
installImageEditing({ store, blocksHost, toast, actions });
installTableFeature({ store, blocksHost, renderer, actions });
installChartFeature({ store, host: blocksHost, renderer, toast, actions });
installBlockContextMenu({ store, host: blocksHost, actions });
installMixedPaste({ store, toast });
installPanelKeyboardGuard();

applyTheme(loadTheme());
renderIcons();
installColorPalettes();

installWindowChrome({ files, menus });
installFileDrop({
  files,
  insertImages: (dropped, target) => { void insertDroppedImages(state, toast, dropped, target); },
});
installFontPreferenceSync(store);
installEditorRuntime({ state, refreshChrome, toast });
installToolbar({ state, files, view, actions, plugins, toast, refreshChrome });
installAbout();
installMcpBridge({ state, files });
installDshPanel();
installFontLibrary(toast);
installShortcuts({ state, files, actions, menus });

maybeShowAltHint(toast);
if (startup.error) toast(startup.error, 4000);
void plugins.load();
installTesting({ state, files, view, actions, plugins });
document.querySelector('#boot-screen')?.remove();
