/** 搜索框与正文内容框共用一套布局尺寸。 */

export const LAYOUT_CHANGE_EVENT = 'dfy:layout-change';
export const SEARCH_LAYOUT_EVENT = 'dfy:search-layout';

let installed = false;

/** 通知布局变化；由窗口、目录、缩放等唯一入口调用。 */
export function notifyLayoutChange(): void {
  window.dispatchEvent(new Event(LAYOUT_CHANGE_EVENT));
}

export function installSearchLayout(): void {
  if (installed) return;
  installed = true;

  let frame = 0;
  const sync = (): void => {
    frame = 0;
    const paper = document.querySelector<HTMLElement>('.paper');
    if (!paper) return;
    const rect = paper.getBoundingClientRect();
    const style = getComputedStyle(paper);
    const leftPadding = Number.parseFloat(style.paddingLeft) || 0;
    const rightPadding = Number.parseFloat(style.paddingRight) || 0;
    const scale = paper.offsetWidth ? rect.width / paper.offsetWidth : 1;
    const left = Math.round(rect.left + leftPadding * scale);
    const contentWidth = Math.round(rect.width - (leftPadding + rightPadding) * scale);
    const buttons = document.querySelector<HTMLElement>('.titlebar-buttons');
    const controlsWidth = buttons?.getBoundingClientRect().width ?? 0;
    const width = Math.min(contentWidth, Math.floor(window.innerWidth - left - controlsWidth - 12));
    if (width <= 0) return;

    const root = document.documentElement;
    const setVar = (name: string, value: string): boolean => {
      if (root.style.getPropertyValue(name) === value) return false;
      root.style.setProperty(name, value);
      return true;
    };
    let changed = setVar('--search-left', `${left}px`);
    changed = setVar('--search-width', `${width}px`) || changed;

    // 面板以输入框实际盒子为准，避免两者在缩放/窄窗口下各算各的。
    const box = document.querySelector<HTMLElement>('#titlebar-search')?.getBoundingClientRect();
    changed = setVar('--search-panel-left', `${Math.round(box?.left ?? left)}px`) || changed;
    changed = setVar('--search-panel-width', `${Math.round(box?.width ?? width)}px`) || changed;

    const titlebar = document.querySelector<HTMLElement>('.titlebar');
    const top = Math.round(titlebar?.getBoundingClientRect().bottom ?? 32);
    changed = setVar('--search-top', `${top}px`) || changed;

    if (changed) window.dispatchEvent(new Event(SEARCH_LAYOUT_EVENT));
  };

  const schedule = (): void => {
    if (frame) return;
    frame = requestAnimationFrame(sync);
  };

  window.addEventListener('resize', schedule);
  window.addEventListener(LAYOUT_CHANGE_EVENT, sync);
  sync();
}
