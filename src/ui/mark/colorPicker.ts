/**
 * 取色器：紧凑的竖排面板（不是旧版那种横向拉很长的布局）。
 * 支持拖动饱和度/明度、色相滑条、HEX 与 RGB 数字输入，带取消/确定。
 */

import { t } from '../../i18n/index.js';

interface Hsv {
  h: number;
  s: number;
  v: number;
}

function hsvToRgb({ h, s, v }: Hsv): { r: number; g: number; b: number } {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let r = 0;
  let g = 0;
  let b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return {
    r: Math.round((r + m) * 255),
    g: Math.round((g + m) * 255),
    b: Math.round((b + m) * 255),
  };
}

function rgbToHsv(r: number, g: number, b: number): Hsv {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === rn) h = 60 * (((gn - bn) / d) % 6);
    else if (max === gn) h = 60 * ((bn - rn) / d + 2);
    else h = 60 * ((rn - gn) / d + 4);
  }
  if (h < 0) h += 360;
  return { h, s: max === 0 ? 0 : d / max, v: max };
}

function toHex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map((value) => Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, '0')).join('')}`;
}

function fromHex(value: string): { r: number; g: number; b: number } | null {
  const match = /^#?([0-9a-f]{6})$/i.exec(value.trim());
  if (!match) return null;
  const hex = match[1];
  return {
    r: Number.parseInt(hex.slice(0, 2), 16),
    g: Number.parseInt(hex.slice(2, 4), 16),
    b: Number.parseInt(hex.slice(4, 6), 16),
  };
}

let panel: HTMLElement | null = null;
let canvas: HTMLCanvasElement | null = null;
let hueInput: HTMLInputElement | null = null;
let hexInput: HTMLInputElement | null = null;
let rgbInputs: HTMLInputElement[] = [];
let swatch: HTMLElement | null = null;
let state: Hsv = { h: 0, s: 1, v: 1 };
let onPick: ((hex: string) => void) | null = null;
let onClose: (() => void) | null = null;
let onAddToPalette: ((hex: string) => boolean) | null = null;
let dragging = false;

function currentRgb(): { r: number; g: number; b: number } {
  return hsvToRgb(state);
}

function currentHex(): string {
  const { r, g, b } = currentRgb();
  return toHex(r, g, b);
}

function paint(): void {
  if (!canvas || !hueInput) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const { width, height } = canvas;
  const { r, g, b } = hsvToRgb({ h: state.h, s: 1, v: 1 });
  const gradient = ctx.createLinearGradient(0, 0, width, 0);
  gradient.addColorStop(0, '#fff');
  gradient.addColorStop(1, `rgb(${r}, ${g}, ${b})`);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
  const dark = ctx.createLinearGradient(0, 0, 0, height);
  dark.addColorStop(0, 'rgba(0,0,0,0)');
  dark.addColorStop(1, '#000');
  ctx.fillStyle = dark;
  ctx.fillRect(0, 0, width, height);

  const cx = state.s * width;
  const cy = (1 - state.v) * height;
  ctx.beginPath();
  ctx.arc(cx, cy, 6, 0, Math.PI * 2);
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, 7.5, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(0,0,0,.35)';
  ctx.lineWidth = 1;
  ctx.stroke();

  const color = currentHex();
  if (swatch) swatch.style.background = color;
  if (hexInput && document.activeElement !== hexInput) hexInput.value = color;
  const rgb = currentRgb();
  rgbInputs.forEach((input, index) => {
    if (document.activeElement !== input) input.value = String([rgb.r, rgb.g, rgb.b][index]);
  });
  if (hueInput.value !== String(Math.round(state.h))) hueInput.value = String(Math.round(state.h));
}

function syncFromRgb(r: number, g: number, b: number): void {
  state = rgbToHsv(r, g, b);
  paint();
}

function ensurePanel(): HTMLElement {
  if (panel) return panel;
  panel = document.createElement('div');
  panel.id = 'color-picker';
  panel.className = 'color-picker';
  panel.hidden = true;
  panel.innerHTML = `
    <div class="cp-head"><span class="cp-title">选择颜色</span><span class="cp-preview"></span></div>
    <canvas class="cp-area" width="220" height="120"></canvas>
    <input type="range" class="cp-hue" min="0" max="360" step="1" />
    <div class="cp-fields">
      <label>HEX <input class="cp-hex" maxlength="7" /></label>
      <div class="cp-rgb">
        <label>R <input class="cp-r" type="number" min="0" max="255" step="1" /></label>
        <label>G <input class="cp-g" type="number" min="0" max="255" step="1" /></label>
        <label>B <input class="cp-b" type="number" min="0" max="255" step="1" /></label>
      </div>
    </div>
    <div class="cp-actions">
      <div class="cp-actions-left">
        <button type="button" class="cp-ok">确定</button>
        <button type="button" class="cp-cancel">取消</button>
      </div>
      <button type="button" class="cp-add">添加到色板</button>
    </div>`;
  document.body.appendChild(panel);

  const areaEl = panel.querySelector<HTMLCanvasElement>('.cp-area')!;
  const hueEl = panel.querySelector<HTMLInputElement>('.cp-hue')!;
  const hexEl = panel.querySelector<HTMLInputElement>('.cp-hex')!;
  const rgbEls = ['r', 'g', 'b'].map((key) => panel!.querySelector<HTMLInputElement>(`.cp-${key}`)!);
  canvas = areaEl;
  hueInput = hueEl;
  hexInput = hexEl;
  swatch = panel.querySelector<HTMLElement>('.cp-preview');
  rgbInputs = rgbEls;

  areaEl.addEventListener('pointerdown', (event) => {
    dragging = true;
    areaEl.setPointerCapture(event.pointerId);
    updateFromCanvas(event);
  });
  areaEl.addEventListener('pointermove', (event) => {
    if (dragging) updateFromCanvas(event);
  });
  areaEl.addEventListener('pointerup', () => { dragging = false; });
  areaEl.addEventListener('pointercancel', () => { dragging = false; });

  hueEl.addEventListener('input', () => {
    state.h = Number(hueEl.value);
    paint();
  });
  hexEl.addEventListener('input', () => {
    const rgb = fromHex(hexEl.value);
    if (rgb) syncFromRgb(rgb.r, rgb.g, rgb.b);
  });
  rgbEls.forEach((input) => {
    input.addEventListener('input', () => {
      const values = rgbEls.map((item) => Math.max(0, Math.min(255, Number(item.value) || 0)));
      syncFromRgb(values[0], values[1], values[2]);
    });
  });
  panel.querySelector('.cp-cancel')?.addEventListener('click', closePicker);
  panel.querySelector('.cp-ok')?.addEventListener('click', () => {
    const color = currentHex();
    onPick?.(color);
    closePicker();
  });
  const addButton = panel.querySelector<HTMLButtonElement>('.cp-add');
  addButton?.addEventListener('click', () => {
    if (!addButton || !onAddToPalette) return;
    const color = currentHex();
    const added = onAddToPalette(color);
    addButton.textContent = added ? t('已添加') : t('已在色板');
    window.setTimeout(() => {
      if (!panel || panel.hidden) return;
      addButton.textContent = t('添加到色板');
    }, 1200);
  });

  document.addEventListener('pointerdown', (event) => {
    if (!panel || panel.hidden) return;
    const target = event.target;
    if (target instanceof Element && (target.closest('#color-picker') || target.closest('[data-color-anchor]'))) return;
    closePicker();
  }, true);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && panel && !panel.hidden) closePicker();
  });
  return panel;
}

function updateFromCanvas(event: PointerEvent): void {
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  const s = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
  const v = Math.min(1, Math.max(0, 1 - (event.clientY - rect.top) / rect.height));
  state.s = s;
  state.v = v;
  paint();
}

function closePicker(): void {
  if (panel) panel.hidden = true;
  onPick = null;
  onAddToPalette = null;
  const done = onClose;
  onClose = null;
  done?.();
}

export interface ColorPickerOptions {
  anchor: HTMLElement;
  color: string;
  offsetX?: number;
  onPick: (hex: string) => void;
  onAddToPalette?: (hex: string) => boolean;
  onClose?: () => void;
}

export function openColorPicker(options: ColorPickerOptions): void {
  const element = ensurePanel();
  const rgb = fromHex(options.color) ?? { r: 237, g: 125, b: 49 };
  state = rgbToHsv(rgb.r, rgb.g, rgb.b);
  onPick = options.onPick;
  onAddToPalette = options.onAddToPalette ?? null;
  onClose = options.onClose ?? null;
  const addButton = element.querySelector<HTMLButtonElement>('.cp-add');
  if (addButton) addButton.hidden = !onAddToPalette;
  element.hidden = false;
  element.setAttribute('data-color-anchor', '1');
  const rect = options.anchor.getBoundingClientRect();
  const width = 260;
  const height = element.offsetHeight || 330;
  const left = Math.min(
    window.innerWidth - width - 12,
    Math.max(12, rect.left - 40 + (options.offsetX ?? 0)),
  );
  const top = Math.min(window.innerHeight - height - 12, Math.max(12, rect.bottom + 6));
  element.style.left = `${left}px`;
  element.style.top = `${top}px`;
  paint();
  hexInput?.focus();
}
