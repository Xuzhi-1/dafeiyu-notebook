/** 空文本块使用的最近字体/字号；null 表示来源块格式混合、无唯一值。 */

const LAST_FONT_KEY = 'dafeiyu-next.last-font-family';
const LAST_SIZE_KEY = 'dafeiyu-next.last-font-size';
const UNKNOWN = '__mixed__';
const DEFAULT_SIZE = 16;

export function loadLastFontFamily(): string | null {
  try {
    const value = localStorage.getItem(LAST_FONT_KEY);
    if (value === null) return '';
    return value === UNKNOWN ? null : value;
  } catch {
    return '';
  }
}

export function saveLastFontFamily(family: string | null): void {
  try {
    localStorage.setItem(LAST_FONT_KEY, family === null ? UNKNOWN : family);
  } catch {
    // 存储不可用时只保留当前会话内的选择。
  }
}

export function loadLastFontSize(): number | null {
  try {
    const value = localStorage.getItem(LAST_SIZE_KEY);
    if (value === null) return DEFAULT_SIZE;
    if (value === UNKNOWN) return null;
    const size = Number.parseFloat(value);
    return Number.isFinite(size) && size > 0 ? Math.min(160, Math.max(1, Math.round(size))) : DEFAULT_SIZE;
  } catch {
    return DEFAULT_SIZE;
  }
}

export function saveLastFontSize(size: number | null): void {
  try {
    localStorage.setItem(LAST_SIZE_KEY, size === null ? UNKNOWN : String(Math.min(160, Math.max(1, Math.round(size)))));
  } catch {
    // 存储不可用时只保留当前会话内的选择。
  }
}
