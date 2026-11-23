/**
 * 主题：四类颜色（背景/纸张/强调/框选）以 CSS 变量落地，保存在 localStorage。
 */

export interface Theme {
  readonly name: string;
  readonly bg: string;
  readonly paper: string;
  readonly accent: string;
  readonly select: string;
}

export const THEMES: Theme[] = [
  { name: '灰白', bg: '#f2f2f0', paper: '#ffffff', accent: '#4d6bfe', select: '#e8e8e8' },
  { name: '暖纸', bg: '#f6f1e7', paper: '#fffdf8', accent: '#a2693c', select: '#eee6d8' },
  { name: '雾青', bg: '#e9efee', paper: '#fbfdfc', accent: '#3f7f78', select: '#e2ecea' },
  { name: '夜间', bg: '#23252a', paper: '#2c2f36', accent: '#7f9cff', select: '#3a3e47' },
];

const KEY = 'dafeiyu-next.theme';

export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  root.style.setProperty('--bg', theme.bg);
  root.style.setProperty('--paper', theme.paper);
  root.style.setProperty('--accent', theme.accent);
  root.style.setProperty('--select', theme.select);
  localStorage.setItem(KEY, theme.name);
}

export function loadTheme(): Theme {
  const saved = localStorage.getItem(KEY);
  return THEMES.find((theme) => theme.name === saved) ?? THEMES[0];
}

export function nextTheme(): Theme {
  const current = loadTheme();
  const index = THEMES.findIndex((theme) => theme.name === current.name);
  const next = THEMES[(index + 1) % THEMES.length];
  applyTheme(next);
  return next;
}
