/**
 * 视图状态：缩放、页面尺寸、主题调色板、目录显隐。
 * 这里只改 body class / CSS 变量 / localStorage，不碰文档。
 */

import type { AppState } from './state.js';
import { notifyLayoutChange } from './searchLayout.js';


export interface Palette {
  bg: string;
  paper: string;
  ink: string;
  select: string;
}

export interface ViewActions {
  applyZoom(next: number): void;
  setPageSize(size: string): void;
  applyPalette(colors: Palette): void;
  loadPalette(): Palette;
  toggleOutline(force?: boolean): void;
}

export function createView(state: AppState): ViewActions {
  function applyZoom(next: number): void {
    state.zoom = Math.min(2, Math.max(0.5, Math.round(next * 20) / 20));
    localStorage.setItem('dafeiyu-next.zoom', String(state.zoom));
    state.blocksHost.style.zoom = String(state.zoom);
    document.documentElement.style.setProperty('--doc-zoom', String(state.zoom));
    notifyLayoutChange();
    const label = document.querySelector<HTMLElement>('#zoom-label');
    if (label) label.textContent = `${Math.round(state.zoom * 100)}%`;
  }

  function setPageSize(size: string): void {
    state.pageSize = size;
    localStorage.setItem('dafeiyu-next.page-size', size);
  }

  function applyPalette(colors: Palette): void {
    const root = document.documentElement;
    root.style.setProperty('--bg', colors.bg);
    root.style.setProperty('--paper', colors.paper);
    root.style.setProperty('--ink', colors.ink);
    root.style.setProperty('--select', colors.select);
    localStorage.setItem('dafeiyu-next.palette', JSON.stringify(colors));
  }

  function loadPalette(): Palette {
    try {
      const saved = JSON.parse(localStorage.getItem('dafeiyu-next.palette') || '{}');
      const style = getComputedStyle(document.documentElement);
      return {
        bg: saved.bg || style.getPropertyValue('--bg').trim() || '#f2f2f0',
        paper: saved.paper || style.getPropertyValue('--paper').trim() || '#ffffff',
        ink: saved.ink || style.getPropertyValue('--ink').trim() || '#1f1f1f',
        select: saved.select || style.getPropertyValue('--select').trim() || '#e8e8e8',
      };
    } catch {
      return { bg: '#f2f2f0', paper: '#ffffff', ink: '#1f1f1f', select: '#e8e8e8' };
    }
  }

  function toggleOutline(force?: boolean): void {
    const hidden = force ?? !document.body.classList.contains('outline-hidden');
    document.body.classList.toggle('outline-hidden', hidden);
    localStorage.setItem('dafeiyu-next.outline-hidden', hidden ? '1' : '0');
    notifyLayoutChange();
  }

  return { applyZoom, setPageSize, applyPalette, loadPalette, toggleOutline };
}

export function installViewUi(state: AppState, view: ViewActions): void {
  const pageSelect = document.querySelector<HTMLSelectElement>('#page-size');
  if (pageSelect) {
    pageSelect.value = state.pageSize;
    pageSelect.addEventListener('change', () => view.setPageSize(pageSelect.value));
  }

  const palette = view.loadPalette();
  const colorMap: Record<string, keyof Palette> = {
    'color-bg': 'bg',
    'color-paper': 'paper',
    'color-ink': 'ink',
    'color-select': 'select',
  };
  for (const [id, key] of Object.entries(colorMap)) {
    const input = document.querySelector<HTMLInputElement>(`#${id}`);
    if (!input) continue;
    input.value = palette[key];
    input.addEventListener('input', () => {
      view.applyPalette({ ...view.loadPalette(), [key]: input.value });
    });
  }
  if (localStorage.getItem('dafeiyu-next.palette')) view.applyPalette(palette);
  view.applyZoom(state.zoom);
  if (localStorage.getItem('dafeiyu-next.outline-hidden') === '1') view.toggleOutline(true);

  state.workspace.addEventListener('wheel', (event) => {
    if (!event.ctrlKey) return;
    event.preventDefault();
    view.applyZoom(state.zoom + (event.deltaY < 0 ? 0.1 : -0.1));
  }, { passive: false });
}
