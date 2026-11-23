/** 通用右键菜单：定位、边界收拢、点击外部/Esc 关闭。 */

import { t } from '../i18n/index.js';

export interface ContextMenuItem {
  label: string;
  onSelect?: () => void;
  checked?: boolean;
  disabled?: boolean;
  danger?: boolean;
  separator?: boolean;
}

export interface ContextMenuOptions {
  compact?: boolean;
}

let current: HTMLElement | null = null;
let cleanup: (() => void) | null = null;

export function closeContextMenu(): void {
  cleanup?.();
  cleanup = null;
  current?.remove();
  current = null;
}

export function openContextMenu(
  items: readonly ContextMenuItem[],
  clientX: number,
  clientY: number,
  options: ContextMenuOptions = {},
): void {
  closeContextMenu();
  const menu = document.createElement('div');
  menu.className = 'context-menu';
  if (options.compact) menu.classList.add('is-compact');
  menu.dataset.contextMenu = '1';

  for (const item of items) {
    if (item.separator) {
      const separator = document.createElement('div');
      separator.className = 'context-menu-separator';
      menu.appendChild(separator);
      continue;
    }
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'context-menu-item';
    button.addEventListener('pointerdown', (event) => event.preventDefault());
    if (item.checked) button.classList.add('is-checked');
    if (item.danger) button.classList.add('is-danger');
    button.disabled = Boolean(item.disabled);
    const check = document.createElement('span');
    check.className = 'context-menu-check';
    check.textContent = item.checked ? '✓' : '';
    const label = document.createElement('span');
    label.textContent = t(item.label);
    button.append(check, label);
    button.addEventListener('click', () => {
      if (item.disabled) return;
      const select = item.onSelect;
      closeContextMenu();
      select?.();
    });
    menu.appendChild(button);
  }

  document.body.appendChild(menu);
  current = menu;
  const rect = menu.getBoundingClientRect();
  const left = Math.max(6, Math.min(clientX, window.innerWidth - rect.width - 6));
  const top = Math.max(6, Math.min(clientY, window.innerHeight - rect.height - 6));
  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;

  const onPointerDown = (event: PointerEvent): void => {
    if (event.target instanceof Node && menu.contains(event.target)) return;
    closeContextMenu();
  };
  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeContextMenu();
    }
  };
  const close = (): void => closeContextMenu();
  const timer = window.setTimeout(() => {
    document.addEventListener('pointerdown', onPointerDown, true);
  }, 0);
  document.addEventListener('keydown', onKeyDown, true);
  window.addEventListener('blur', close);
  window.addEventListener('resize', close);
  window.addEventListener('scroll', close, true);

  cleanup = () => {
    window.clearTimeout(timer);
    document.removeEventListener('pointerdown', onPointerDown, true);
    document.removeEventListener('keydown', onKeyDown, true);
    window.removeEventListener('blur', close);
    window.removeEventListener('resize', close);
    window.removeEventListener('scroll', close, true);
  };
}
