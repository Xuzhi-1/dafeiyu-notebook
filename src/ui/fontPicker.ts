/** 自定义字体下拉：不抢正文焦点，选择后保留文字选区。 */

import { applyTextSelection, captureTextSelection, type TextSelectionSnapshot } from '../editor/textSelection.js';

interface FontPicker {
  sync(): void;
  close(): void;
}

export function installFontPicker(
  select: HTMLSelectElement,
  button: HTMLButtonElement,
  label: HTMLElement,
): FontPicker {
  let menu: HTMLElement | null = null;
  let savedSelection: TextSelectionSnapshot | null = null;
  let cleanup: (() => void) | null = null;

  const close = (): void => {
    cleanup?.();
    cleanup = null;
    menu?.remove();
    menu = null;
    savedSelection = null;
    button.setAttribute('aria-expanded', 'false');
  };

  const sync = (): void => {
    const option = select.selectedIndex >= 0 ? select.options[select.selectedIndex] : null;
    label.textContent = option?.textContent ?? (select.options.length ? '' : '字体');
    button.title = option?.textContent ?? '字体';
    if (!menu) return;
    const currentIndex = select.selectedIndex;
    menu.querySelectorAll<HTMLElement>('[data-font-value]').forEach((item, index) => {
      item.classList.toggle('is-active', index === currentIndex);
    });
  };

  const open = (): void => {
    if (menu) { close(); return; }
    if (!select.options.length) return;
    savedSelection = captureTextSelection();
    menu = document.createElement('div');
    menu.className = 'font-picker-menu';
    menu.setAttribute('role', 'listbox');
    menu.setAttribute('aria-label', '字体');
    for (const [index, option] of [...select.options].entries()) {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'font-picker-option';
      item.dataset.fontValue = option.value;
      item.setAttribute('role', 'option');
      item.setAttribute('aria-selected', String(index === select.selectedIndex));
      item.textContent = option.textContent ?? '';
      if (index === select.selectedIndex) item.classList.add('is-active');
      item.addEventListener('mousedown', (event) => event.preventDefault());
      item.addEventListener('click', () => {
        applyTextSelection(savedSelection);
        select.value = option.value;
        select.dispatchEvent(new Event('change', { bubbles: true }));
        close();
      });
      menu.appendChild(item);
    }
    document.body.appendChild(menu);
    const rect = button.getBoundingClientRect();
    menu.style.left = `${Math.max(8, Math.min(window.innerWidth - menu.offsetWidth - 8, rect.left))}px`;
    menu.style.top = `${Math.max(8, Math.min(window.innerHeight - menu.offsetHeight - 8, rect.bottom + 4))}px`;
    button.setAttribute('aria-expanded', 'true');

    const onPointerDown = (event: PointerEvent): void => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (menu?.contains(target) || button.contains(target)) return;
      close();
    };
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') { event.preventDefault(); close(); }
    };
    const onViewport = (): void => close();
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('resize', onViewport);
    window.addEventListener('scroll', onViewport, true);
    cleanup = () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('resize', onViewport);
      window.removeEventListener('scroll', onViewport, true);
    };
  };

  button.addEventListener('mousedown', (event) => event.preventDefault());
  button.addEventListener('click', open);
  button.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      open();
    }
  });

  sync();
  return { sync, close };
}
