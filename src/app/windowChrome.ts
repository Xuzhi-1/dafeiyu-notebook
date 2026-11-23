/**
 * 无边框窗口、菜单外点、最近文件、外链。
 */

import type { MenuController } from '../ui/menus.js';
import { platform } from '../platform/ipc.js';
import type { FileActions } from './files.js';

export interface WindowChromeDeps {
  files: FileActions;
  menus: MenuController;
}

export function installWindowChrome({ files, menus }: WindowChromeDeps): void {
  function setMaximizedIcon(maximized: boolean): void {
    const button = document.querySelector<HTMLElement>('#win-max');
    if (button) button.textContent = maximized ? '❐' : '□';
  }

  document.querySelector('#win-min')?.addEventListener('click', () => window.moye?.windowControls?.minimize());
  document.querySelector('#win-max')?.addEventListener('click', () => window.moye?.windowControls?.maximize());
  document.querySelector('#win-close')?.addEventListener('click', () => window.moye?.windowControls?.close());
  document.querySelector('#titlebar')?.addEventListener('dblclick', (event) => {
    if (event.target instanceof Element && event.target.closest('button')) return;
    window.moye?.windowControls?.maximize();
  });
  window.moye?.windowControls?.onMaximized?.(setMaximizedIcon);
  void window.moye?.windowControls?.state?.().then((result) => setMaximizedIcon(Boolean(result?.maximized)));

  document.addEventListener('pointerdown', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (!target.closest('#mark-panel, #btn-mark-more, #color-picker, .context-menu')) {
      const panel = document.querySelector<HTMLElement>('#mark-panel');
      if (panel && !panel.hidden) {
        panel.hidden = true;
        document.dispatchEvent(new CustomEvent('dfy:mark-panel-dismissed'));
      }
    }
    if (!target.closest('#comment-panel, #btn-comment-more, #color-picker')) {
      const panel = document.querySelector<HTMLElement>('#comment-panel');
      if (panel && !panel.hidden) {
        panel.hidden = true;
        document.dispatchEvent(new CustomEvent('dfy:comment-panel-dismissed'));
      }
    }
  }, true);

  for (const id of ['#file-menu', '#more-menu']) {
    document.querySelector(id)?.addEventListener('click', (event) => {
      const target = event.target;
      if (target instanceof Element && target.closest('button')) menus.close();
    });
  }

  document.querySelector('#btn-open-window')?.addEventListener('click', () => {
    menus.close();
    void files.openInNewWindow();
  });

  document.querySelector('#file-menu')?.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const button = target.closest<HTMLElement>('[data-recent-path]');
    if (!button?.dataset.recentPath) return;
    void files.openInNewWindow(button.dataset.recentPath);
    menus.close();
  });

  document.querySelector<HTMLElement>('#blocks')?.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const link = target.closest<HTMLAnchorElement>('a[href]');
    if (!link) return;
    if (!/^https?:\/\//i.test(link.href)) return;
    event.preventDefault();
    void window.moye?.openExternal?.(link.href);
  });

  platform()?.onOpenPath((path) => { void files.openPath(path); });
  void platform()?.rendererReady().then((path) => {
    if (path) void files.openPath(path);
  });
}
