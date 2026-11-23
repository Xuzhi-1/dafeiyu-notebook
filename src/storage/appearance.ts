/** 跨会话外观设置：集中管理 key、默认值和容错。 */

import type { HighlightMode } from '../editor/highlight.js';

const COMMENT_APPEARANCE_KEY = 'dafeiyu-next.note-appearance';
const TEXT_COLOR_KEY = 'dafeiyu-next.text-color';
const HIGHLIGHT_COLOR_KEY = 'dafeiyu-next.highlight-color';
const HIGHLIGHT_MODE_KEY = 'dafeiyu-next.highlight-mode';

const DEFAULT_COMMENT_COLOR = '#4d6bfe';
const DEFAULT_TEXT_COLOR = '#c00000';
const DEFAULT_HIGHLIGHT_COLOR = '#ffe27a';
const DEFAULT_HIGHLIGHT_MODE: HighlightMode = 'marker';
const HIGHLIGHT_MODES = new Set<HighlightMode>(['marker', 'solid', 'wavy', 'dashed']);

function read(key: string): string {
  try {
    return localStorage.getItem(key) || '';
  } catch {
    return '';
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // 存储不可用时保持当前会话值。
  }
}

function validColor(value: string, fallback: string): string {
  return /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
}

export function loadCommentColor(): string {
  try {
    const saved = JSON.parse(read(COMMENT_APPEARANCE_KEY) || '{}');
    return validColor(typeof saved.color === 'string' ? saved.color : '', DEFAULT_COMMENT_COLOR);
  } catch {
    return DEFAULT_COMMENT_COLOR;
  }
}

export function saveCommentColor(color: string): void {
  write(COMMENT_APPEARANCE_KEY, JSON.stringify({ color }));
}

export function loadTextColor(): string {
  return validColor(read(TEXT_COLOR_KEY), DEFAULT_TEXT_COLOR);
}

export function saveTextColor(color: string): void {
  write(TEXT_COLOR_KEY, color);
}

export function loadHighlightColor(): string {
  return validColor(read(HIGHLIGHT_COLOR_KEY), DEFAULT_HIGHLIGHT_COLOR);
}

export function saveHighlightColor(color: string): void {
  write(HIGHLIGHT_COLOR_KEY, color);
}

export function loadHighlightMode(): HighlightMode {
  const value = read(HIGHLIGHT_MODE_KEY) as HighlightMode;
  return HIGHLIGHT_MODES.has(value) ? value : DEFAULT_HIGHLIGHT_MODE;
}

export function saveHighlightMode(mode: HighlightMode): void {
  write(HIGHLIGHT_MODE_KEY, mode);
}
