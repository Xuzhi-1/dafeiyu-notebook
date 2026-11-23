/** 标记图标栏：布局持久化、自定义图标、拖动排序。 */

import { openContextMenu } from '../contextMenu.js';
import { showToast } from '../toast.js';
import { t } from '../../i18n/index.js';

interface IconChoice {
  value: string;
  glyph: string;
  label: string;
  custom?: boolean;
}

const DEFAULT_ICONS: IconChoice[] = [
  { value: 'star', glyph: '★', label: t('星') },
  { value: '▲', glyph: '▲', label: t('已掌握') },
  { value: '!', glyph: '!', label: t('重要') },
  { value: '?', glyph: '?', label: t('疑问') },
  { value: '●', glyph: '●', label: t('圆点') },
  { value: '※', glyph: '※', label: t('参考') },
  { value: '♦', glyph: '♦', label: t('方块') },
  { value: '⊙', glyph: '⊙', label: t('目标') },
  { value: '◇', glyph: '◇', label: t('空心') },
  { value: '☀', glyph: '☀', label: t('太阳') },
  { value: '❤', glyph: '❤', label: t('爱心') },
  { value: '✿', glyph: '✿', label: t('花朵') },
  { value: '♚', glyph: '♚', label: t('王冠') },
  { value: '♠', glyph: '♠', label: t('黑桃') },
  { value: '■', glyph: '■', label: t('方框') },
];

const LEGACY_GLYPHS: Record<string, string> = {
  target: '◎',
  flame: '🔥',
  leaf: '🍃',
  heart: '♥',
  bolt: '⚡',
  moon: '☾',
  sun: '☀',
  pin: '📌',
};

const ICON_LAYOUT_KEY = 'dafeiyu-next.icon-layout';
const LEGACY_CUSTOM_KEY = 'dafeiyu-next.custom-icons';
const ICON_DEFAULTS_KEY = 'dafeiyu-next.icon-defaults-v2';
const MAX_CUSTOM_ICONS = 85;
const MAX_ICONS = DEFAULT_ICONS.length + MAX_CUSTOM_ICONS;

function glyphOf(value: string): string {
  return LEGACY_GLYPHS[value] ?? value;
}

export function markIconGlyph(value: string): string {
  if (value === 'star') return '★';
  return glyphOf(value) || '★';
}

function readLegacyCustomIcons(): string[] {
  try {
    const value = JSON.parse(localStorage.getItem(LEGACY_CUSTOM_KEY) || '[]');
    if (!Array.isArray(value)) return [];
    const blocked = new Set(DEFAULT_ICONS.map((item) => item.glyph));
    return [...new Set(value
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim())
      .filter((item) => item && !blocked.has(item)))]
      .slice(-MAX_CUSTOM_ICONS);
  } catch {
    return [];
  }
}

function writeIconLayout(layout: readonly IconChoice[]): void {
  const kept: IconChoice[] = [];
  let custom = 0;
  for (let index = layout.length - 1; index >= 0; index -= 1) {
    const item = layout[index];
    if (item.custom) {
      if (custom >= MAX_CUSTOM_ICONS) continue;
      custom += 1;
    }
    kept.unshift(item);
  }
  localStorage.setItem(ICON_LAYOUT_KEY, JSON.stringify(kept.slice(0, MAX_ICONS)));
}

function readIconLayout(): IconChoice[] {
  const raw = localStorage.getItem(ICON_LAYOUT_KEY);
  if (raw === null) {
    const seeded: IconChoice[] = [
      ...DEFAULT_ICONS.map((item) => ({ ...item })),
      ...readLegacyCustomIcons().map((glyph): IconChoice => ({
        value: glyph,
        glyph,
        label: t('自定义图标'),
        custom: true,
      })),
    ];
    writeIconLayout(seeded);
    localStorage.setItem(ICON_DEFAULTS_KEY, '1');
    return seeded;
  }
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const seen = new Set<string>();
    const layout: IconChoice[] = [];
    for (const item of parsed) {
      if (!item || typeof item.value !== 'string' || typeof item.glyph !== 'string') continue;
      if (seen.has(item.value)) continue;
      seen.add(item.value);
      layout.push({
        value: item.value,
        glyph: item.glyph,
        label: typeof item.label === 'string' ? item.label : '图标',
        custom: item.custom === true,
      });
    }
    if (!layout.some((item) => item.value === 'star')) {
      layout.unshift({ value: 'star', glyph: '★', label: t('星') });
      writeIconLayout(layout);
    }
    if (localStorage.getItem(ICON_DEFAULTS_KEY) !== '1') {
      const values = new Set(layout.map((item) => item.value));
      const glyphs = new Set(layout.map((item) => item.glyph));
      const missing = DEFAULT_ICONS.filter((item) => !values.has(item.value) && !glyphs.has(item.glyph));
      if (missing.length) {
        const firstCustom = layout.findIndex((item) => item.custom);
        layout.splice(firstCustom < 0 ? layout.length : firstCustom, 0, ...missing.map((item) => ({ ...item })));
        writeIconLayout(layout);
      }
      localStorage.setItem(ICON_DEFAULTS_KEY, '1');
    }
    return layout.slice(0, MAX_ICONS);
  } catch {
    return [];
  }
}

function syncIconSelection(value: string): void {
  document.querySelectorAll<HTMLElement>('#mark-icon-grid [data-icon-value]').forEach((button) => {
    const active = button.dataset.iconValue === value;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-checked', String(active));
  });
}

function setIconValue(value: string): void {
  const input = document.querySelector<HTMLInputElement>('#mark-icon');
  if (!input) return;
  input.value = value;
  syncIconSelection(value);
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

function choicesFor(selected: string): IconChoice[] {
  const choices = readIconLayout();
  if (
    selected
    && choices.length
    && !choices.some((item) => item.value === selected || item.glyph === selected)
  ) {
    choices.push({ value: selected, glyph: glyphOf(selected), label: t('当前图标') });
  }
  return choices;
}

function showAddForm(): void {
  const form = document.querySelector<HTMLElement>('#mark-icon-add-form');
  const input = document.querySelector<HTMLInputElement>('#mark-icon-add-input');
  if (!form || !input) return;
  form.hidden = false;
  input.value = '';
  input.focus();
}

function addCustomIcon(): void {
  const form = document.querySelector<HTMLElement>('#mark-icon-add-form');
  const input = document.querySelector<HTMLInputElement>('#mark-icon-add-input');
  const hidden = document.querySelector<HTMLInputElement>('#mark-icon');
  if (!form || !input || !hidden) return;
  const glyph = input.value.trim();
  if (!glyph) return;

  const layout = readIconLayout();
  const existing = layout.find((item) => item.glyph === glyph || item.value === glyph);
  if (existing) {
    setIconValue(existing.value);
    form.hidden = true;
    return;
  }
  if (layout.filter((item) => item.custom).length >= MAX_CUSTOM_ICONS) {
    showToast(t('自定义图标已达上限（{count} 个），请先删除一个', { count: MAX_CUSTOM_ICONS }), 2800);
    return;
  }

  layout.push({ value: glyph, glyph, label: t('自定义图标'), custom: true });
  writeIconLayout(layout);
  form.hidden = true;
  renderMarkIcons(glyph);
  setIconValue(glyph);
}

function removeIcon(value: string): void {
  if (value === 'star') return;
  const layout = readIconLayout().filter((item) => item.value !== value);
  writeIconLayout(layout);
  const hidden = document.querySelector<HTMLInputElement>('#mark-icon');
  const selected = hidden?.value === value ? (layout[0]?.value ?? 'star') : hidden?.value ?? 'star';
  setIconValue(selected);
  renderMarkIcons(selected);
}

function moveIcon(fromValue: string, toValue: string, after: boolean): void {
  if (fromValue === toValue) return;
  const layout = readIconLayout();
  const fromIndex = layout.findIndex((item) => item.value === fromValue);
  if (fromIndex < 0) return;
  const [item] = layout.splice(fromIndex, 1);
  let targetIndex = layout.findIndex((entry) => entry.value === toValue);
  if (targetIndex < 0) targetIndex = layout.length;
  else if (after) targetIndex += 1;
  layout.splice(targetIndex, 0, item);
  writeIconLayout(layout);
  const hidden = document.querySelector<HTMLInputElement>('#mark-icon');
  renderMarkIcons(hidden?.value ?? layout[0]?.value ?? 'star');
}

let draggingIcon: string | null = null;

function clearDropUi(grid: HTMLElement): void {
  grid.querySelectorAll('.is-dragging, .is-drop-before, .is-drop-after, .is-drop-target').forEach((item) => {
    item.classList.remove('is-dragging', 'is-drop-before', 'is-drop-after', 'is-drop-target');
  });
}

function bindIconGrid(): void {
  const grid = document.querySelector<HTMLElement>('#mark-icon-grid');
  if (!grid || grid.dataset.bound) return;
  grid.dataset.bound = '1';

  grid.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const button = target.closest<HTMLElement>('[data-icon-value]');
    if (!button) return;
    setIconValue(button.dataset.iconValue ?? 'star');
  });

  grid.addEventListener('contextmenu', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const button = target.closest<HTMLElement>('[data-icon-value]');
    if (!button) return;
    event.preventDefault();
    const value = button.dataset.iconValue ?? '';
    if (value === 'star') {
      openContextMenu([
        { label: t('星标不可删除'), disabled: true },
      ], event.clientX, event.clientY, { compact: true });
      return;
    }
    openContextMenu([
      { label: t('删除'), danger: true, onSelect: () => removeIcon(value) },
    ], event.clientX, event.clientY, { compact: true });
  });

  grid.addEventListener('dragstart', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const button = target.closest<HTMLElement>('[data-icon-value]');
    if (!button) return;
    draggingIcon = button.dataset.iconValue ?? null;
    button.classList.add('is-dragging');
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', draggingIcon ?? '');
    }
  });

  grid.addEventListener('dragover', (event) => {
    const target = event.target;
    if (!(target instanceof Element) || !draggingIcon) return;
    const button = target.closest<HTMLElement>('[data-icon-value]');
    if (!button) return;
    if (button.dataset.iconValue === draggingIcon) {
      clearDropUi(grid);
      return;
    }
    event.preventDefault();
    clearDropUi(grid);
    const rect = button.getBoundingClientRect();
    button.classList.add(event.clientX > rect.left + rect.width / 2 ? 'is-drop-after' : 'is-drop-before');
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
  });

  grid.addEventListener('drop', (event) => {
    const target = event.target;
    if (!(target instanceof Element) || !draggingIcon) return;
    const button = target.closest<HTMLElement>('[data-icon-value]');
    if (!button) return;
    event.preventDefault();
    const rect = button.getBoundingClientRect();
    const after = event.clientX > rect.left + rect.width / 2;
    moveIcon(draggingIcon, button.dataset.iconValue ?? '', after);
    draggingIcon = null;
    clearDropUi(grid);
  });

  grid.addEventListener('dragend', () => {
    draggingIcon = null;
    clearDropUi(grid);
  });

  const addButton = document.querySelector<HTMLElement>('#mark-icon-add-btn');
  if (addButton && !addButton.dataset.bound) {
    addButton.dataset.bound = '1';
    addButton.addEventListener('click', showAddForm);
  }

  const form = document.querySelector<HTMLElement>('#mark-icon-add-form');
  if (form && !form.dataset.bound) {
    form.dataset.bound = '1';
    form.querySelector('#mark-icon-add-confirm')?.addEventListener('click', addCustomIcon);
    form.querySelector('#mark-icon-add-cancel')?.addEventListener('click', () => {
      form.hidden = true;
    });
    form.querySelector<HTMLInputElement>('#mark-icon-add-input')?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        addCustomIcon();
      } else if (event.key === 'Escape') {
        form.hidden = true;
      }
    });
  }
}

export function renderMarkIcons(selected: string): void {
  const grid = document.querySelector<HTMLElement>('#mark-icon-grid');
  if (!grid) return;
  grid.replaceChildren();

  for (const choice of choicesFor(selected)) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'mark-icon-choice';
    button.dataset.iconValue = choice.value;
    if (choice.custom) button.dataset.custom = '1';
    button.textContent = choice.glyph;
    button.title = t('{label}（可拖动排序）', { label: choice.label });
    button.draggable = true;
    button.setAttribute('role', 'radio');
    grid.appendChild(button);
  }

  bindIconGrid();
  syncIconSelection(selected);
}
