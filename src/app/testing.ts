/**
 * 冒烟测试 / 性能测试句柄（window.__dafeiyu）。
 * 生产环境保留也无害，但集中在这里，不污染主流程。
 */

import { addGroupNoteOp, addNoteOp, commentCount, defaultMark, setMarkOp } from '../core/notes.js';
import { searchDoc } from '../core/search.js';
import { selectMany } from '../core/selection.js';
import {
  tableAddColumnOp, tableAddRowOp, tableRemoveColumnOp, tableRemoveRowOp, tableToggleHeaderOp,
} from '../core/table.js';
import { addEntry, labelForBlocks, moveEntry, removeEntry, renameEntry, tocOp, toggleCollapse } from '../core/toc.js';
import { createBlock, type Block } from '../core/types.js';
import { groupSelection, setBlockAlign, toggleInline, ungroupSelection } from '../editor/format.js';
import { jumpToEntry } from '../editor/scroll.js';
import { platform } from '../platform/ipc.js';
import { nextTheme } from '../ui/theme.js';
import type { FileActions } from './files.js';
import type { Plugins } from './plugins.js';
import type { ToolbarActions } from './toolbar.js';
import type { ViewActions } from './view.js';
import { activeId, type AppState } from './state.js';

export interface TestingDeps {
  state: AppState;
  files: FileActions;
  view: ViewActions;
  actions: ToolbarActions;
  plugins: Plugins;
}

export function installTesting({ state, files, view, actions, plugins }: TestingDeps): void {
  const { store, renderer } = state;

  function loadPerfDoc(count: number): { renderMs: number } {
    const blocks: Block[] = Array.from({ length: count }, (_, index) => ({
      ...createBlock('paragraph'),
      id: `perf_${index}`,
      html: `性能测试块 ${index + 1}`,
    }));
    store.replaceDoc({ ...store.doc, blocks, toc: [] });
    renderer.clear();
    const started = performance.now();
    renderer.render(store.doc);
    return { renderMs: Math.round(performance.now() - started) };
  }

  Object.assign(window as unknown as Record<string, unknown>, {
    __dafeiyu: {
      store,
      renderer,
      ready: true,
      get lastStats() { return state.lastStats; },
      get filePath() { return state.filePath; },
      get dirty() { return state.dirty; },
      loadPerfDoc,
      pluginHost: plugins.host,
      clipboard: {
        snapshot: () => platform()?.snapshotClipboard() ?? Promise.resolve(null),
        restore: (snapshot: import('../platform/ipc.js').ClipboardSnapshot | null) =>
          platform()?.restoreClipboard(snapshot) ?? Promise.resolve(false),
      },
      searchPanel: state.searchPanel,
      openPath: files.openPath,
      save: files.save,
      saveAs: files.saveAs,
      exportDocx: files.exportDocx,
      exportPdf: files.exportPdf,
      search: (query: string) => searchDoc(store.doc, query),
      actions: {
        bold: () => toggleInline(store, 'bold'),
        highlight: () => actions.highlightSelection(),
        center: () => setBlockAlign(store, 'center'),
        group: () => groupSelection(store),
        ungroup: () => ungroupSelection(store),
        selectAll: () => store.setSelection(selectMany(store.doc.blocks.map((block) => block.id))),
        tocAdd: (ids?: string[]) => {
          const target = ids?.length ? ids : store.selection.blockIds;
          return target.length ? store.dispatch(() => tocOp(addEntry(store.doc, target))) : false;
        },
        tocRemove: (entryId: string) => store.dispatch(() => tocOp(removeEntry(store.doc, entryId))),
        tocToggle: (entryId: string) => store.dispatch(() => tocOp(toggleCollapse(store.doc, entryId))),
        tocMove: (entryId: string, targetId: string, position: 'before' | 'after' | 'inside') => store.dispatch(() => tocOp(moveEntry(store.doc, entryId, targetId, position))),
        tocRename: (entryId: string, label: string) => store.dispatch(() => tocOp(renameEntry(store.doc, entryId, label))),
        tocLabel: (blockIds: string[]) => labelForBlocks(store.doc, blockIds),
        copy: () => actions.copySelection(),
        cut: () => actions.cutSelection(),
        paste: () => actions.pasteClipboard(),
        deleteSelection: () => actions.deleteSelection(),
        clearSelection: () => actions.clearSelection(),
        newDoc: () => files.newDocument(),
        importText: () => files.importText(),
        move: (delta: number) => actions.moveActive(delta),
        duplicate: () => actions.duplicateActive(),
        deleteOne: () => actions.deleteActive(),
        link: (url: string) => actions.applyInlineLink(url),
        zoom: (value: number) => view.applyZoom(value),
        setPageSize: (size: string) => view.setPageSize(size),
        palette: (colors: { bg: string; paper: string; ink: string; select: string }) => view.applyPalette(colors),
        insertImage: () => actions.insertImage(),
        imageWidth: (delta: number) => actions.adjustImageWidth(delta),
        imageReset: () => actions.resetImageWidth(),
        tableRowAdd: () => actions.tableAction(tableAddRowOp),
        tableRowDel: () => actions.tableAction(tableRemoveRowOp),
        tableColAdd: () => actions.tableAction(tableAddColumnOp),
        tableColDel: () => actions.tableAction(tableRemoveColumnOp),
        tableHeader: () => actions.tableAction(tableToggleHeaderOp),
        markImage: () => actions.markWithImage(),
        jump: (entryId: string) => {
          const entry = store.doc.toc.find((item) => item.id === entryId);
          if (!entry) return false;
          const ids = entry.blockIds.length ? entry.blockIds : [entry.blockId];
          store.setSelection(selectMany(ids));
          return jumpToEntry(entry, state.workspace);
        },
        comment: (text: string, blockId?: string) => {
          const id = blockId ?? store.selection.activeId ?? store.selection.blockIds[0];
          return id ? store.dispatch(() => addNoteOp(store.doc, id, text)) : false;
        },
        commentImage: async (blockId?: string) => {
          const api = platform();
          if (!api) return false;
          const picked = await api.pickImage();
          const id = blockId ?? activeId(state);
          if (!picked || !id) return false;
          return store.dispatch(() => addNoteOp(store.doc, id, '', [], [picked.dataUrl]));
        },
        groupComment: (text: string) => store.dispatch(() => addGroupNoteOp(store.doc, store.selection.blockIds, text)),
        mark: () => {
          const ids = store.selection.blockIds.length
            ? store.selection.blockIds
            : [store.selection.activeId].filter(Boolean) as string[];
          return store.dispatch(() => setMarkOp(store.doc, ids, defaultMark('mark')));
        },
        clearMark: () => {
          const ids = store.selection.blockIds.length
            ? store.selection.blockIds
            : [store.selection.activeId].filter(Boolean) as string[];
          return store.dispatch(() => setMarkOp(store.doc, ids, null));
        },
        openNotes: (blockId: string) => state.comments.openBlock(blockId, null),
        noteCount: (blockId: string) => commentCount(store.doc, blockId),
        searchPanel: () => state.searchPanel?.toggle(),
        theme: () => nextTheme(),
      },
    },
  });
}
