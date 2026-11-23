/**
 * 插件装配：宿主、管理面板、插槽徽章、命令按钮、toast 与 Alt 提示。
 */

import { createBlock, type Block } from '../core/types.js';
import { selectMany } from '../core/selection.js';
import { inheritedFontFamily, withBlockFont } from '../editor/blockFont.js';
import { PluginHost } from '../plugins/host.js';
import { PluginPanel } from '../ui/plugins.js';
import { showToast } from '../ui/toast.js';
import { escapeAttr, escapeHtml, type AppState, type Toast } from './state.js';

export interface Plugins {
  host: PluginHost;
  panel: PluginPanel | null;
  applyUi(): void;
  load(): Promise<void>;
}

export function createToast(): Toast {
  return showToast;
}

export function createPlugins(state: AppState, toast: Toast): Plugins {
  const { store } = state;

  function insertPluginText(text: string): void {
    const active = document.activeElement;
    if (active instanceof HTMLElement && active.closest('.block-content')) {
      document.execCommand('insertText', false, text);
      return;
    }
    const block: Block = withBlockFont(createBlock('paragraph', text), inheritedFontFamily(store.doc.blocks));
    store.dispatch((doc) => [{ t: 'insertBlocks', at: doc.blocks.length, blocks: [block] }], selectMany([block.id]));
  }

  const host = new PluginHost({ store, toast, insertText: insertPluginText });
  const actionsHost = document.querySelector<HTMLElement>('#plugin-actions');
  const panelHost = document.querySelector<HTMLElement>('#plugins');
  const panel = panelHost ? new PluginPanel(panelHost, host, {
    onReload: async () => { await host.load(); plugins.applyUi(); },
    onReorder: (ids) => { host.reorder(ids); plugins.applyUi(); },
    onDelete: async (id) => {
      const result = await window.moye?.plugins?.remove?.(id);
      if (result?.error) {
        toast(`删除失败：${result.error}`);
        return false;
      }
      return true;
    },
  }) : null;

  function applyUi(): void {
    if (actionsHost) {
      const order = new Map(host.manifests.map((manifest, index) => [manifest.id, index]));
      const commands = [...host.registry.listCommands()]
        .sort((a, b) => (order.get(a.pluginId) ?? Number.MAX_SAFE_INTEGER) - (order.get(b.pluginId) ?? Number.MAX_SAFE_INTEGER));
      actionsHost.hidden = commands.length === 0;
      actionsHost.innerHTML = commands
        .map((command) => `<button type="button" data-plugin-command="${escapeAttr(command.id)}" title="${escapeAttr(command.pluginName)}">${escapeHtml(command.title)}</button>`)
        .join('');
    }
    panel?.render();
  }

  actionsHost?.addEventListener('mousedown', (event) => {
    if (event.target instanceof Element && event.target.closest('[data-plugin-command]')) event.preventDefault();
  });
  actionsHost?.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const button = target.closest<HTMLElement>('[data-plugin-command]');
    const id = button?.dataset.pluginCommand;
    if (!id) return;
    const command = host.registry.listCommands().find((item) => item.id === id);
    if (!command) return;
    const fail = (error: unknown): void => {
      toast(`插件执行失败：${(error as Error)?.message ?? error}`);
    };
    try {
      const result = command.run();
      if (result && typeof (result as PromiseLike<unknown>).then === 'function') {
        void Promise.resolve(result).catch(fail);
      }
    } catch (error) {
      fail(error);
    }
  });

  const plugins: Plugins = {
    host,
    panel,
    applyUi,
    load: async () => { await host.load(); applyUi(); },
  };
  return plugins;
}

export function maybeShowAltHint(toast: Toast): void {
  const key = 'dafeiyu-next.alt-hint-count';
  const count = Number(localStorage.getItem(key) || '0');
  if (count >= 5) return;
  localStorage.setItem(key, String(count + 1));
  window.setTimeout(() => toast('按住 Alt 点击区块可多选；此时不可编辑', 4000), 1500);
}
