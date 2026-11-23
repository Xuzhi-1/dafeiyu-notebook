/** 全局轻提示：所有界面共用同一个 #toast 节点。 */

import { t } from '../i18n/index.js';

let timer = 0;

export function showToast(message: string, duration = 2200): void {
  const host = document.querySelector<HTMLElement>('#toast');
  if (!host) return;
  host.textContent = t(message);
  host.hidden = false;
  clearTimeout(timer);
  timer = window.setTimeout(() => {
    host.hidden = true;
  }, duration);
}
