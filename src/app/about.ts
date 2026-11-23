/** 关于窗口：只负责打开、关闭和焦点恢复。内容保持静态，避免与文档模块耦合。 */
import { t } from '../i18n/index.js';

export function installAbout(): () => void {
  const overlay = document.querySelector<HTMLElement>('#about-overlay');
  const closeButton = document.querySelector<HTMLButtonElement>('#btn-about-close');
  const scroll = document.querySelector<HTMLElement>('#about-scroll');
  const trigger = document.querySelector<HTMLElement>('#btn-about');
  const versionLabel = document.querySelector<HTMLElement>('#about-version');
  if (!overlay || !closeButton || !scroll) return () => {};

  let versionPromise: Promise<string | null> | null = null;
  const loadVersion = (): Promise<string | null> => {
    versionPromise ??= (async () => {
      try {
        return (await window.moye?.info())?.version || null;
      } catch {
        return null;
      }
    })();
    return versionPromise;
  };
  const renderVersion = async (): Promise<void> => {
    if (!versionLabel) return;
    versionLabel.textContent = t('大肥鱼笔记本');
    const version = await loadVersion();
    if (version) versionLabel.textContent = `${t('大肥鱼笔记本')} v${version}`;
  };
  void renderVersion();

  let previousFocus: HTMLElement | null = null;

  const close = (): void => {
    if (overlay.hidden) return;
    overlay.hidden = true;
    document.body.classList.remove('about-open');
    previousFocus?.focus({ preventScroll: true });
    previousFocus = null;
  };

  const open = (): void => {
    previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    overlay.hidden = false;
    document.body.classList.add('about-open');
    scroll.scrollTop = 0;
    closeButton.focus({ preventScroll: true });
  };

  trigger?.addEventListener('click', open);
  closeButton.addEventListener('click', close);
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) close();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || overlay.hidden) return;
    event.preventDefault();
    close();
  });

  return close;
}
