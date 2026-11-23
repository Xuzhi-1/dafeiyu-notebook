/** 插件宿主：加载 manifest + 动态 import 插件脚本 + 组装 API。 */

import type { Store } from '../core/store.js';
import { normalizeChart } from '../core/chart.js';
import { createBlockInsertionPlan } from '../core/blockInsertion.js';
import { selectMany } from '../core/selection.js';
import { plainText } from '../core/toc.js';
import { createBlock, type Block } from '../core/types.js';
import { PluginRegistry, type PluginCommand } from './registry.js';

export interface PluginManifest {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly description?: string;
  readonly main: string;
  readonly source?: 'user' | 'builtin';
}

export interface PluginHostOptions {
  readonly store: Store;
  readonly toast: (message: string) => void;
  readonly insertText: (text: string) => void;
}

interface PluginInstance {
  readonly id: string;
  readonly disposers: (() => void)[];
}

const DISABLED_KEY = 'dafeiyu-next.plugins.disabled';
const ORDER_KEY = 'dafeiyu-next.plugins.order';
const HIDDEN_KEY = 'dafeiyu-next.plugins.hidden';

export function readDisabled(): Record<string, boolean> {
  try {
    const value = JSON.parse(localStorage.getItem(DISABLED_KEY) || '{}');
    return value && typeof value === 'object' ? value : {};
  } catch {
    return {};
  }
}

export function writeDisabled(map: Record<string, boolean>): void {
  localStorage.setItem(DISABLED_KEY, JSON.stringify(map));
}

function readOrder(): string[] {
  try {
    const value = JSON.parse(localStorage.getItem(ORDER_KEY) || '[]');
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

function writeOrder(ids: readonly string[]): void {
  localStorage.setItem(ORDER_KEY, JSON.stringify(ids));
}

function readHidden(): string[] {
  try {
    const value = JSON.parse(localStorage.getItem(HIDDEN_KEY) || '[]');
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

function writeHidden(ids: readonly string[]): void {
  localStorage.setItem(HIDDEN_KEY, JSON.stringify(ids));
}

function orderManifests(manifests: PluginManifest[]): PluginManifest[] {
  const rank = new Map(readOrder().map((id, index) => [id, index]));
  return [...manifests].sort((a, b) => (rank.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (rank.get(b.id) ?? Number.MAX_SAFE_INTEGER));
}

function storageFor(id: string) {
  const prefix = `dafeiyu-next.plugin.${id}.`;
  return {
    get(key: string, fallback: unknown = null): unknown {
      try {
        const raw = localStorage.getItem(prefix + key);
        return raw === null ? fallback : JSON.parse(raw);
      } catch {
        return fallback;
      }
    },
    set(key: string, value: unknown): void {
      localStorage.setItem(prefix + key, JSON.stringify(value));
    },
    remove(key: string): void {
      localStorage.removeItem(prefix + key);
    },
  };
}

export class PluginHost {
  readonly registry = new PluginRegistry();
  manifests: PluginManifest[] = [];
  loaded: string[] = [];
  failures: { id: string; name: string; error: string }[] = [];

  private instances: PluginInstance[] = [];
  private loadQueue: Promise<void> = Promise.resolve();

  constructor(private readonly options: PluginHostOptions) {}

  /** 串行加载，避免重载/开关/删除并发破坏注册表。 */
  load(): Promise<void> {
    const run = this.loadQueue.then(() => this.doLoad(), () => this.doLoad());
    this.loadQueue = run.catch(() => {});
    return run;
  }

  private async doLoad(): Promise<void> {
    this.disposeInstances();
    this.registry.clear();
    this.loaded = [];
    this.failures = [];
    const disabled = readDisabled();
    let manifests: PluginManifest[] = [];
    let listFailed = false;
    try {
      manifests = (await window.moye?.plugins?.list?.()) ?? [];
    } catch (error) {
      listFailed = true;
      this.failures.push({ id: 'plugins', name: '插件目录', error: String((error as Error)?.message ?? error) });
    }
    const previousHidden = readHidden();
    const hidden = new Set(previousHidden);
    if (!listFailed) {
      const known = new Set(manifests.map((manifest) => manifest.id));
      const hiddenIds = previousHidden.filter((id) => known.has(id));
      if (hiddenIds.length !== previousHidden.length) writeHidden(hiddenIds);
      hidden.clear();
      for (const id of hiddenIds) hidden.add(id);
    }
    this.manifests = orderManifests(manifests.filter((manifest) => !hidden.has(manifest.id)));

    for (const manifest of this.manifests) {
      if (disabled[manifest.id]) continue;
      const disposers: (() => void)[] = [];
      try {
        const url = `moye-plugin://${encodeURIComponent(manifest.id)}/${manifest.main || 'main.js'}?t=${Date.now()}`;
        const module = await import(/* @vite-ignore */ url);
        const api = this.createApi(manifest, disposers);
        const cleanup = typeof module.activate === 'function' ? await module.activate(api) : undefined;
        if (typeof cleanup === 'function') disposers.push(cleanup as () => void);
        this.instances.push({ id: manifest.id, disposers });
        this.loaded.push(manifest.id);
      } catch (error) {
        disposeAll(disposers);
        this.failures.push({ id: manifest.id, name: manifest.name, error: String((error as Error)?.message ?? error) });
      }
    }
  }

  private disposeInstances(): void {
    const instances = this.instances;
    this.instances = [];
    for (const instance of instances.reverse()) disposeAll(instance.disposers);
  }

  hiddenIds(): string[] {
    return readHidden();
  }

  hide(id: string): void {
    const hidden = readHidden();
    if (!hidden.includes(id)) writeHidden([...hidden, id]);
  }

  restoreHidden(): void {
    writeHidden([]);
  }

  reorder(ids: readonly string[]): void {
    const rank = new Map(ids.map((id, index) => [id, index]));
    this.manifests = [...this.manifests].sort((a, b) =>
      (rank.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (rank.get(b.id) ?? Number.MAX_SAFE_INTEGER));
    writeOrder(this.manifests.map((item) => item.id));
  }

  private insertBlock(block: Block): string | null {
    const store = this.options.store;
    const plan = createBlockInsertionPlan(
      store.doc,
      store.selection.blockIds,
      [block],
      [],
      { preserveIds: true },
    );
    if (plan) {
      return store.dispatch(() => plan.ops, selectMany(plan.selection))
        ? plan.selection[0] ?? null
        : null;
    }
    return store.dispatch(
      (doc) => [{ t: 'insertBlocks', at: doc.blocks.length, blocks: [block] }],
      selectMany([block.id]),
    ) ? block.id : null;
  }

  private createApi(manifest: PluginManifest, disposers: (() => void)[]) {
    const { store, toast, insertText } = this.options;
    const dispose = (fn: () => void): (() => void) => {
      disposers.push(fn);
      return fn;
    };
    return {
      id: manifest.id,
      name: manifest.name,
      version: manifest.version,
      toast: (message: string) => toast(String(message ?? '')),
      onDispose: (fn: () => void) => {
        if (typeof fn === 'function') dispose(fn);
      },
      commands: {
        register: (command: { id?: string; title: string; run: () => unknown }) => {
          if (!command?.title || typeof command.run !== 'function') return () => {};
          const entry: PluginCommand = {
            id: `${manifest.id}:${command.id ?? command.title}`,
            title: String(command.title),
            pluginId: manifest.id,
            pluginName: manifest.name,
            run: command.run,
          };
          return dispose(this.registry.registerCommand(entry));
        },
      },
      editor: {
        insertImage: (src: string, options: { width?: number; caption?: string } = {}) => {
          const url = String(src ?? '').trim();
          if (!/^data:image\/(?:png|jpe?g|gif|webp|svg\+xml)[;,]/i.test(url) || url.length > 8 * 1024 * 1024) return null;
          const width = Number.isFinite(Number(options.width)) ? Math.min(100, Math.max(10, Math.round(Number(options.width)))) : 100;
          const caption = typeof options.caption === 'string' ? options.caption.slice(0, 200) : '';
          return this.insertBlock({ ...createBlock('image'), meta: { src: url, width, caption } });
        },
        insertChart: (spec: unknown) => this.insertBlock({
          ...createBlock('chart'),
          meta: { chart: normalizeChart(spec) },
        }),
        getText: () => store.doc.blocks.map((block) => plainText(block.html)).join('\n'),
        getActiveBlockText: () => {
          const active = store.selection.activeId;
          const block = store.doc.blocks.find((item) => item.id === active);
          return block ? plainText(block.html) : '';
        },
        getSelection: () => ({
          blockIds: [...store.selection.blockIds],
          text: store.doc.blocks
            .filter((block) => store.selection.blockIds.includes(block.id))
            .map((block) => plainText(block.html))
            .join('\n'),
        }),
        getBlockCount: () => store.doc.blocks.length,
        insertText: (text: string) => insertText(String(text ?? '')),
      },
      files: {
        saveText: (name: string, content: string) => window.moye?.saveText?.(String(name ?? '插件输出'), String(content ?? '')),
      },
      doc: {
        getTitle: () => store.doc.title,
      },
      storage: storageFor(manifest.id),
    };
  }
}

function disposeAll(disposers: (() => void)[]): void {
  for (const dispose of disposers.reverse()) {
    try {
      dispose();
    } catch {
      // 单个清理失败不能阻断其余插件卸载。
    }
  }
}
