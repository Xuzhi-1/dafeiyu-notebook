/** 本机字体库：默认字体 + 导入字体，统一排序；默认字体不可删除。 */

import type { Toast } from '../app/state.js';
import { t } from '../i18n/index.js';
import { cssFontFamily, DEFAULT_FONT_FAMILY } from '../core/font.js';
import { openContextMenu } from './contextMenu.js';

interface StoredFont {
  id: string;
  name: string;
  data: ArrayBuffer;
  order: number;
}

interface FontEntry {
  id: string;
  name: string;
  family: string;
  builtin: boolean;
  face?: FontFace;
  data?: ArrayBuffer;
}

const DEFAULT_FONTS: readonly Omit<FontEntry, 'builtin'>[] = [
  { id: 'builtin:source-han', name: t('思源黑体'), family: '' },
  { id: 'builtin:lxgw', name: t('霞鹜文楷'), family: 'LXGW WenKai' },
  { id: 'builtin:misans', name: 'MiSans', family: 'MiSans' },
];
const DB_NAME = 'dafeiyu-next-fonts';
const DB_VERSION = 2;
const STORE_NAME = 'fonts';
const SETTINGS_STORE = 'settings';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
      if (!request.result.objectStoreNames.contains(SETTINGS_STORE)) {
        request.result.createObjectStore(SETTINGS_STORE, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error(t('无法打开字体库')));
  });
}

function requestOf<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error(t('字体库操作失败')));
  });
}

async function readAll(): Promise<StoredFont[]> {
  const db = await openDb();
  const store = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME);
  const items = await requestOf(store.getAll());
  db.close();
  return items;
}

async function save(entry: StoredFont): Promise<void> {
  const db = await openDb();
  const store = db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME);
  await requestOf(store.put(entry));
  db.close();
}

async function saveMany(entries: readonly StoredFont[]): Promise<void> {
  if (!entries.length) return;
  const db = await openDb();
  const transaction = db.transaction(STORE_NAME, 'readwrite');
  const store = transaction.objectStore(STORE_NAME);
  for (const entry of entries) store.put(entry);
  await new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error(t('字体排序保存失败')));
    transaction.onabort = () => reject(transaction.error ?? new Error('字体排序保存失败'));
  });
  db.close();
}

async function readOrder(): Promise<string[]> {
  try {
    const db = await openDb();
    const store = db.transaction(SETTINGS_STORE, 'readonly').objectStore(SETTINGS_STORE);
    const value = await requestOf(store.get('font-order'));
    db.close();
    return Array.isArray(value?.value) ? value.value.filter((id: unknown): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

async function saveOrder(order: readonly string[]): Promise<void> {
  try {
    const db = await openDb();
    const store = db.transaction(SETTINGS_STORE, 'readwrite').objectStore(SETTINGS_STORE);
    await requestOf(store.put({ id: 'font-order', value: [...order] }));
    db.close();
  } catch {
    /* 排序仍保留在本次会话 */
  }
}

async function removeStored(id: string): Promise<void> {
  const db = await openDb();
  const store = db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME);
  await requestOf(store.delete(id));
  db.close();
}

function familyFromFile(file: File): string {
  const base = file.name.replace(/\.[^.]+$/, '').trim() || t('自定义字体');
  return base.replace(/[\\/:*?"<>|]/g, ' ').replace(/\s+/g, ' ').slice(0, 40);
}

function uniqueName(name: string, used: Set<string>): string {
  if (!used.has(name)) return name;
  let index = 2;
  while (used.has(`${name} ${index}`)) index += 1;
  return `${name} ${index}`;
}

function arrange(defaults: readonly FontEntry[], custom: readonly FontEntry[], order: readonly string[]): FontEntry[] {
  const all = [...defaults, ...custom];
  const byId = new Map(all.map((entry) => [entry.id, entry]));
  const seen = new Set<string>();
  const ordered: FontEntry[] = [];
  for (const id of order) {
    const entry = byId.get(id);
    if (!entry || seen.has(id)) continue;
    seen.add(id);
    ordered.push(entry);
  }
  for (const entry of all) {
    if (seen.has(entry.id)) continue;
    seen.add(entry.id);
    ordered.push(entry);
  }
  return ordered;
}

export function installFontLibrary(toast: Toast): void {
  const button = document.querySelector<HTMLElement>('#btn-fonts');
  const panel = document.querySelector<HTMLElement>('#font-panel');
  const list = document.querySelector<HTMLElement>('#font-list');
  const fileInput = document.querySelector<HTMLInputElement>('#font-file');
  const select = document.querySelector<HTMLSelectElement>('#font-family');
  if (!button || !panel || !list || !fileInput || !select) return;

  const defaults: FontEntry[] = DEFAULT_FONTS.map((font) => ({ ...font, builtin: true }));
  let fonts: FontEntry[] = arrange(defaults, [], []);
  let dragIndex = -1;
  const used = (): Set<string> => new Set(fonts.map((font) => font.name));

  const rebuildOptions = (): void => {
    const selected = select.value;
    select.replaceChildren();
    for (const font of fonts) {
      const option = document.createElement('option');
      option.value = font.family;
      option.textContent = font.name;
      if (font.builtin) option.dataset.defaultFont = '1';
      option.dataset.fontId = font.id;
      select.appendChild(option);
    }
    select.value = [...select.options].some((option) => option.value === selected) ? selected : '';
    window.dispatchEvent(new CustomEvent('dfy:font-options'));
  };

  const render = (): void => {
    list.replaceChildren();
    fonts.forEach((font, index) => {
      const row = document.createElement('div');
      row.className = 'font-row';
      const name = document.createElement('span');
      name.className = 'font-row-name';
      name.style.fontFamily = cssFontFamily(font.family || DEFAULT_FONT_FAMILY);
      name.textContent = `${font.name}  ${t('Aa 字体预览')}`;
      const grip = document.createElement('span');
      grip.className = 'font-drag';
      grip.draggable = true;
      grip.title = t('拖动排序');
      grip.setAttribute('aria-hidden', 'true');
      grip.addEventListener('dragstart', (event) => {
        dragIndex = index;
        event.dataTransfer?.setData('text/plain', font.id);
        if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
      });
      grip.addEventListener('dragend', () => { dragIndex = -1; });
      row.addEventListener('dragover', (event) => {
        if (dragIndex < 0) return;
        event.preventDefault();
        row.classList.add('drag-over');
      });
      row.addEventListener('dragleave', () => row.classList.remove('drag-over'));
      row.addEventListener('drop', (event) => {
        event.preventDefault();
        row.classList.remove('drag-over');
        if (dragIndex < 0) return;
        const from = dragIndex;
        dragIndex = -1;
        void moveTo(from, index);
      });
      row.addEventListener('contextmenu', (event) => {
        event.preventDefault();
        openContextMenu([{
          label: t('删除字体'),
          disabled: font.builtin,
          danger: !font.builtin,
          onSelect: () => { void remove(index); },
        }], event.clientX, event.clientY);
      });
      const del = document.createElement('button');
      del.type = 'button';
      del.textContent = t(font.builtin ? '默认' : '删除');
      del.title = t(font.builtin ? '默认字体不可删除' : '删除字体');
      del.disabled = font.builtin;
      del.addEventListener('click', () => {
        if (!font.builtin) void remove(index);
      });
      row.append(name, grip, del);
      list.appendChild(row);
    });
  };

  const persistOrder = async (): Promise<void> => {
    await saveOrder(fonts.map((font) => font.id));
    await saveMany(fonts.filter((font) => !font.builtin).map((font, index) => ({
      id: font.id,
      name: font.name,
      data: font.data!,
      order: index,
    })));
  };

  const moveTo = async (from: number, to: number): Promise<void> => {
    if (from === to || from < 0 || to < 0 || from >= fonts.length || to >= fonts.length) return;
    const next = [...fonts];
    const [entry] = next.splice(from, 1);
    next.splice(to, 0, entry);
    fonts = next;
    await persistOrder();
    render();
    rebuildOptions();
  };

  const remove = async (index: number): Promise<void> => {
    const font = fonts[index];
    if (!font || font.builtin) return;
    if (font.face) document.fonts.delete(font.face);
    await removeStored(font.id);
    fonts = fonts.filter((_, position) => position !== index);
    await persistOrder();
    render();
    rebuildOptions();
  };

  const add = async (file: File): Promise<void> => {
    try {
      const name = uniqueName(familyFromFile(file), used());
      const data = await file.arrayBuffer();
      const face = new FontFace(name, data);
      await face.load();
      document.fonts.add(face);
      const entry: StoredFont = {
        id: `font_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
        name,
        data,
        order: fonts.length,
      };
      await save(entry);
      fonts = [...fonts, { id: entry.id, name, family: name, builtin: false, face, data }];
      await persistOrder();
      render();
      rebuildOptions();
      toast(t('已添加字体：{name}', { name }));
    } catch {
      toast(t('字体加载失败，请确认文件是有效的 TTF/OTF/WOFF'));
    }
  };

  button.addEventListener('click', () => {
    const opening = panel.hidden;
    panel.hidden = !opening;
    if (opening) render();
  });
  panel.querySelector('[data-font-close]')?.addEventListener('click', () => { panel.hidden = true; });
  document.querySelector('#btn-font-add')?.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    fileInput.value = '';
    if (file) void add(file);
  });
  document.addEventListener('pointerdown', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (target.closest('#font-panel, #btn-fonts')) return;
    panel.hidden = true;
  }, true);

  rebuildOptions();
  render();

  void (async () => {
    try {
      const [stored, order] = await Promise.all([
        readAll().then((items) => items.sort((a, b) => a.order - b.order)),
        readOrder(),
      ]);
      const custom: FontEntry[] = [];
      for (const item of stored) {
        try {
          const face = new FontFace(item.name, item.data);
          await face.load();
          document.fonts.add(face);
          custom.push({ id: item.id, name: item.name, family: item.name, builtin: false, face, data: item.data });
        } catch {
          // 单个损坏字体跳过，不影响其他字体。
        }
      }
      fonts = arrange(defaults, custom, order);
      rebuildOptions();
      render();
    } catch {
      rebuildOptions();
      render();
    }
  })();
}
