/** 标记/注释颜色快捷面板：主题色、标准色与自定义色。 */

import { openContextMenu } from './contextMenu.js';

const TOP_COLORS = [
  '#000000', '#FF0000', '#FF8000', '#FFFF00', '#00FF00',
  '#00FFFF', '#0000FF', '#8000FF', '#FF00FF',
];

const LIGHT_COLORS = [
  '#FFFFFF', '#FEE2E2', '#FFEDD5', '#FEF08A', '#BBF7D0',
  '#99F6E4', '#BFDBFE', '#DDD6FE', '#FBCFE8',
];

const NEUTRAL_COLORS = ['#4B5563', '#9CA3AF', '#E5E7EB'];
const DEFAULT_COLORS = [...TOP_COLORS, ...LIGHT_COLORS, ...NEUTRAL_COLORS];
const COLOR_ORDER_KEY = 'dafeiyu-next.color-order-v3';
const CUSTOM_KEY = 'dafeiyu-next.custom-colors';
const MAX_CUSTOM = 10;
let installed = false;

function normalizeColors(value: unknown, fallback: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of Array.isArray(value) ? value : []) {
    if (typeof item !== 'string' || !/^#[0-9a-f]{6}$/i.test(item)) continue;
    const color = item.toLowerCase();
    if (!fallback.some((entry) => entry.toLowerCase() === color) || seen.has(color)) continue;
    seen.add(color);
    result.push(color);
  }
  for (const color of fallback) {
    const normalized = color.toLowerCase();
    if (!seen.has(normalized)) result.push(normalized);
  }
  return result;
}

function readDefaultOrder(): string[] {
  try {
    return normalizeColors(JSON.parse(localStorage.getItem(COLOR_ORDER_KEY) || '[]'), DEFAULT_COLORS);
  } catch {
    return [...DEFAULT_COLORS];
  }
}

function writeDefaultOrder(colors: readonly string[]): void {
  localStorage.setItem(COLOR_ORDER_KEY, JSON.stringify(colors));
}

function moveDefaultColor(from: string, to: string, after: boolean): void {
  if (!from || from === to) return;
  const colors = readDefaultOrder();
  const fromIndex = colors.indexOf(from.toLowerCase());
  if (fromIndex < 0) return;
  const [color] = colors.splice(fromIndex, 1);
  let targetIndex = colors.indexOf(to.toLowerCase());
  if (targetIndex < 0) targetIndex = colors.length;
  else if (after) targetIndex += 1;
  colors.splice(targetIndex, 0, color);
  writeDefaultOrder(colors);
  repaintPalettes();
}

function readCustom(): string[] {
  try {
    const value = JSON.parse(localStorage.getItem(CUSTOM_KEY) || '[]');
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is string => typeof item === 'string' && /^#[0-9a-f]{6}$/i.test(item)).slice(-MAX_CUSTOM);
  } catch {
    return [];
  }
}

function writeCustom(colors: readonly string[]): void {
  localStorage.setItem(CUSTOM_KEY, JSON.stringify(colors));
}

function repaintPalettes(): void {
  document.querySelectorAll<HTMLElement>('.color-palette[data-color-input]').forEach((container) => {
    const input = document.querySelector<HTMLInputElement>(`#${container.dataset.colorInput}`);
    if (input) paintRows(container, input);
  });
}

function copyColor(color: string): void {
  const text = color.toUpperCase();
  if (navigator.clipboard?.writeText) {
    void navigator.clipboard.writeText(text).catch(() => fallbackCopy(text));
    return;
  }
  fallbackCopy(text);
}

function fallbackCopy(text: string): void {
  const area = document.createElement('textarea');
  area.value = text;
  area.style.position = 'fixed';
  area.style.opacity = '0';
  document.body.appendChild(area);
  area.select();
  document.execCommand('copy');
  area.remove();
}

function removeCustomColor(color: string): void {
  const normalized = color.toLowerCase();
  writeCustom(readCustom().filter((item) => item !== normalized));
  repaintPalettes();
}

function moveCustomColor(from: string, to: string, after: boolean): void {
  if (from === to) return;
  const colors = readCustom();
  const fromIndex = colors.indexOf(from);
  if (fromIndex < 0) return;
  const [color] = colors.splice(fromIndex, 1);
  let targetIndex = colors.indexOf(to);
  if (targetIndex < 0) targetIndex = colors.length;
  else if (after) targetIndex += 1;
  colors.splice(targetIndex, 0, color);
  writeCustom(colors);
  repaintPalettes();
}

function sync(container: HTMLElement, input: HTMLInputElement): void {
  const value = input.value.toLowerCase();
  container.querySelectorAll<HTMLElement>('[data-color]').forEach((button) => {
    button.classList.toggle('is-active', button.dataset.color?.toLowerCase() === value);
  });
  const previewId = container.dataset.colorPreview;
  const preview = previewId ? document.querySelector<HTMLElement>(`#${previewId}`) : null;
  if (preview) preview.style.background = value;
  const codeId = container.dataset.colorCode;
  const code = codeId ? document.querySelector<HTMLElement>(`#${codeId}`) : null;
  if (code instanceof HTMLInputElement) {
    if (document.activeElement !== code) code.value = value.toUpperCase();
  } else if (code) {
    code.textContent = value.toUpperCase();
  }
}

function normalizeHex(value: string): string | null {
  const raw = value.trim();
  const color = raw.startsWith('#') ? raw : `#${raw}`;
  return /^#[0-9a-f]{6}$/i.test(color) ? color.toLowerCase() : null;
}

function bindColorCodeField(codeId: string, inputId: string): void {
  const code = document.querySelector<HTMLInputElement>(`#${codeId}`);
  const input = document.querySelector<HTMLInputElement>(`#${inputId}`);
  if (!code || !input || code.dataset.bound) return;
  code.dataset.bound = '1';

  code.addEventListener('click', () => code.select());
  code.addEventListener('input', () => {
    const color = normalizeHex(code.value);
    if (!color) return;
    input.value = color;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  const commit = (): void => {
    const color = normalizeHex(code.value) ?? input.value;
    code.value = color.toUpperCase();
    if (color !== input.value) {
      input.value = color;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
  };
  code.addEventListener('change', commit);
  code.addEventListener('blur', commit);
  code.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      code.blur();
    } else if (event.key === 'Escape') {
      code.value = input.value.toUpperCase();
      code.blur();
    }
  });
  code.value = input.value.toUpperCase();
}

function bindColorCode(): void {
  bindColorCodeField('mark-color-code', 'mark-color');
  bindColorCodeField('comment-color-code', 'comment-color');
  bindColorCodeField('text-color-code', 'text-color');
  bindColorCodeField('highlight-color-code', 'highlight-color');
}

function paintRows(container: HTMLElement, input: HTMLInputElement): void {
  container.replaceChildren();
  const ordered = readDefaultOrder();
  const rows: { colors: string[]; custom: boolean }[] = [
    { colors: ordered.slice(0, 9), custom: false },
    { colors: ordered.slice(9, 18), custom: false },
    { colors: ordered.slice(18), custom: false },
  ];
  const custom = readCustom();
  if (custom.length) rows.push({ colors: custom, custom: true });

  for (const group of rows) {
    if (group.custom) {
      const divider = document.createElement('div');
      divider.className = 'color-palette-divider';
      container.appendChild(divider);
    }
    const row = document.createElement('div');
    row.className = 'color-palette-row';
    const dropLine = document.createElement('div');
    dropLine.className = 'color-drop-line';
    dropLine.hidden = true;
    row.appendChild(dropLine);
    for (const color of group.colors) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'color-palette-swatch';
      button.dataset.color = group.custom ? color : color.toUpperCase();
      if (group.custom) button.dataset.custom = '1';
      else button.dataset.defaultColor = '1';
      button.draggable = false;
      button.style.background = color;
      button.title = group.custom ? `${color}（可拖动排序）` : color;
      button.setAttribute('aria-label', color);
      button.addEventListener('click', () => {
        if (button.dataset.suppressClick) {
          delete button.dataset.suppressClick;
          return;
        }
        input.value = color;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      });
      let drag: {
        pointerId: number;
        startX: number;
        startY: number;
        moved: boolean;
        target: { color: string; after: boolean } | null;
      } | null = null;

      const cleanupDrag = (): void => {
        if (!drag) return;
        if (button.hasPointerCapture(drag.pointerId)) button.releasePointerCapture(drag.pointerId);
        drag = null;
        container.querySelectorAll<HTMLElement>('.color-drop-line').forEach((line) => { line.hidden = true; });
        button.classList.remove('is-dragging');
      };

      const updateDropTarget = (clientX: number, clientY: number): void => {
        if (!drag) return;
        const selector = group.custom
          ? '.color-palette-swatch[data-custom="1"]'
          : '.color-palette-swatch[data-default-color="1"]';
        const hit = document.elementFromPoint(clientX, clientY)?.closest<HTMLElement>(selector);
        if (!hit || hit === button) {
          drag.target = null;
          container.querySelectorAll<HTMLElement>('.color-drop-line').forEach((line) => { line.hidden = true; });
          return;
        }
        const rect = hit.getBoundingClientRect();
        const after = clientX > rect.left + rect.width / 2;
        drag.target = { color: hit.dataset.color ?? '', after };
        container.querySelectorAll<HTMLElement>('.color-drop-line').forEach((line) => { line.hidden = true; });
        const line = hit.closest<HTMLElement>('.color-palette-row')?.querySelector<HTMLElement>('.color-drop-line');
        if (line) {
          line.hidden = false;
          line.style.left = `${hit.offsetLeft + (after ? hit.offsetWidth + 1 : -1)}px`;
        }
      };

      button.addEventListener('mousedown', (event) => event.preventDefault());
      button.addEventListener('pointerdown', (event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        delete button.dataset.suppressClick;
        drag = {
          pointerId: event.pointerId,
          startX: event.clientX,
          startY: event.clientY,
          moved: false,
          target: null,
        };
        try {
          button.setPointerCapture(event.pointerId);
        } catch {
          // 合成事件（测试）没有真实指针捕获。
        }
      });
      button.addEventListener('pointermove', (event) => {
        if (!drag || drag.pointerId !== event.pointerId) return;
        if (!drag.moved && Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < 4) return;
        drag.moved = true;
        button.classList.add('is-dragging');
        updateDropTarget(event.clientX, event.clientY);
        event.preventDefault();
      });
      button.addEventListener('pointerup', (event) => {
        if (!drag || drag.pointerId !== event.pointerId) return;
        const { moved, target } = drag;
        cleanupDrag();
        if (moved) {
          button.dataset.suppressClick = '1';
          if (target?.color) {
            if (group.custom) moveCustomColor(color, target.color, target.after);
            else moveDefaultColor(color, target.color, target.after);
          }
          event.preventDefault();
          return;
        }
        input.value = color;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      });
      button.addEventListener('pointercancel', cleanupDrag);

      if (group.custom) {
        button.addEventListener('contextmenu', (event) => {
          event.preventDefault();
          openContextMenu([
            { label: '复制色号', onSelect: () => copyColor(color) },
            { label: '删除', danger: true, onSelect: () => removeCustomColor(color) },
          ], event.clientX, event.clientY);
        });
      }
      row.appendChild(button);
    }
    container.appendChild(row);
  }

  if (!container.dataset.bound) {
    container.dataset.bound = '1';
    input.addEventListener('input', () => sync(container, input));
  }
  sync(container, input);
}

export function installColorPalettes(): void {
  if (installed) return;
  installed = true;
  document.querySelectorAll<HTMLElement>('.color-palette[data-color-input]').forEach((container) => {
    const input = document.querySelector<HTMLInputElement>(`#${container.dataset.colorInput}`);
    if (input) paintRows(container, input);
  });
  bindColorCode();
}

export function syncColorPalette(inputId: string): void {
  const input = document.querySelector<HTMLInputElement>(`#${inputId}`);
  if (!input) return;
  const container = document.querySelector<HTMLElement>(`.color-palette[data-color-input="${inputId}"]`);
  if (container) sync(container, input);
}

/** 把当前颜色加入自定义色板；已存在时返回 false。 */
export function addColorToPalette(hex: string): boolean {
  const color = hex.trim();
  if (!/^#[0-9a-f]{6}$/i.test(color)) return false;
  const normalized = color.toLowerCase();
  const custom = readCustom();
  const existing = new Set([
    ...DEFAULT_COLORS,
    ...custom,
  ].map((item) => item.toLowerCase()));
  if (existing.has(normalized)) return false;
  writeCustom([...custom, normalized].slice(-MAX_CUSTOM));
  repaintPalettes();
  return true;
}
