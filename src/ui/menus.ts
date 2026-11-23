/**
 * 顶栏两个下拉菜单（文件 / 更多）的开合与定位。
 * 只负责“面板怎么弹”，不关心菜单项具体做什么。
 */

export interface MenuControllerOptions {
  fileMenu: HTMLElement | null;
  moreMenu: HTMLElement | null;
  fileButton: HTMLElement | null;
  moreButton: HTMLElement | null;
  /** 打开文件菜单时刷新“最近打开”列表 */
  onFileMenuOpen?: () => void;
}

export class MenuController {
  constructor(private readonly options: MenuControllerOptions) {
    options.fileButton?.addEventListener('mousedown', preventDefault);
    options.fileButton?.addEventListener('click', () => {
      this.toggle(options.fileMenu, options.fileButton, options.onFileMenuOpen);
    });
    options.moreButton?.addEventListener('mousedown', preventDefault);
    options.moreButton?.addEventListener('click', () => {
      this.toggle(options.moreMenu, options.moreButton);
    });
    document.addEventListener('pointerdown', this.onPointerDown, true);
  }

  close(): void {
    if (this.options.fileMenu) this.options.fileMenu.hidden = true;
    if (this.options.moreMenu) this.options.moreMenu.hidden = true;
  }

  isOpen(): boolean {
    return this.options.fileMenu?.hidden === false || this.options.moreMenu?.hidden === false;
  }

  dispose(): void {
    document.removeEventListener('pointerdown', this.onPointerDown, true);
  }

  private toggle(menu: HTMLElement | null, anchor: HTMLElement | null, beforeOpen?: () => void): void {
    const opening = Boolean(menu?.hidden);
    this.close();
    if (!menu || !opening) return;
    menu.hidden = false;
    if (anchor) this.position(menu, anchor);
    beforeOpen?.();
  }

  private position(menu: HTMLElement, anchor: HTMLElement): void {
    const rect = anchor.getBoundingClientRect();
    menu.style.top = `${Math.round(rect.bottom + 4)}px`;
    if (menu.id === 'file-menu') menu.style.left = `${Math.round(rect.left)}px`;
    else menu.style.right = `${Math.round(window.innerWidth - rect.right)}px`;
  }

  private onPointerDown = (event: PointerEvent): void => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (target.closest('#file-menu, #more-menu, #btn-file, #btn-more')) return;
    this.close();
  };
}

function preventDefault(event: Event): void {
  event.preventDefault();
}
