/** 标记外观：当前颜色与图标的唯一持久化入口。 */

import { markIconGlyph } from './markIcons.js';

export interface MarkAppearance {
  color: string;
  icon: string;
}

const APPEARANCE_KEY = 'dafeiyu-next.mark-appearance';
const LEGACY_COLOR_KEY = 'dafeiyu-next.mark-color';
const DEFAULT_COLOR = '#ED7D31';
const DEFAULT_ICON = 'star';

function validColor(value: unknown): string | null {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value : null;
}

export function loadMarkAppearance(): MarkAppearance {
  let color: string | null = null;
  let icon: string | null = null;
  try {
    const saved = JSON.parse(localStorage.getItem(APPEARANCE_KEY) || 'null');
    if (saved && typeof saved === 'object') {
      color = validColor(saved.color);
      if (typeof saved.icon === 'string' && saved.icon) icon = saved.icon;
    }
  } catch {
    // ignore broken appearance data
  }
  color = color ?? validColor(localStorage.getItem(LEGACY_COLOR_KEY)) ?? DEFAULT_COLOR;
  return { color, icon: icon ?? DEFAULT_ICON };
}

export function saveMarkAppearance(next: Partial<MarkAppearance>): MarkAppearance {
  const current = loadMarkAppearance();
  const value: MarkAppearance = {
    color: validColor(next.color) ?? current.color,
    icon: typeof next.icon === 'string' && next.icon ? next.icon : current.icon,
  };
  localStorage.setItem(APPEARANCE_KEY, JSON.stringify(value));
  // 兼容旧版本只读取 mark-color 的路径。
  localStorage.setItem(LEGACY_COLOR_KEY, value.color);
  return value;
}

/** 把面板当前控件值保存为默认标记外观。 */
export function saveMarkAppearanceFromInputs(): MarkAppearance {
  const saved = loadMarkAppearance();
  const color = document.querySelector<HTMLInputElement>('#mark-color')?.value ?? saved.color;
  const icon = document.querySelector<HTMLInputElement>('#mark-icon')?.value ?? saved.icon;
  return saveMarkAppearance({ color, icon });
}

/** 把已保存外观写入面板控件，返回写入值。 */
export function setMarkAppearanceInputs(appearance = loadMarkAppearance()): MarkAppearance {
  const color = document.querySelector<HTMLInputElement>('#mark-color');
  const icon = document.querySelector<HTMLInputElement>('#mark-icon');
  if (color) color.value = appearance.color;
  if (icon) icon.value = appearance.icon;
  return appearance;
}

/** 工具栏星标同时显示当前颜色和当前图标。 */
export function refreshMarkToolbarIcon(color?: string, icon?: string): void {
  const iconEl = document.querySelector<HTMLElement>('#btn-mark .tb-ic');
  if (!iconEl) return;
  const colorInput = document.querySelector<HTMLInputElement>('#mark-color');
  const iconInput = document.querySelector<HTMLInputElement>('#mark-icon');
  const saved = loadMarkAppearance();
  const resolvedColor = color ?? colorInput?.value ?? saved.color;
  const resolvedIcon = icon ?? iconInput?.value ?? saved.icon;
  iconEl.style.color = resolvedColor;
  iconEl.classList.add('mark-glyph');
  iconEl.textContent = markIconGlyph(resolvedIcon);
}
