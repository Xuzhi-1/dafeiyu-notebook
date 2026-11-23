import { platform, type McpStatus } from '../platform/ipc.js';
import { t } from '../i18n/index.js';

function query<T extends HTMLElement>(id: string): T | null {
  return document.querySelector<T>(`#${id}`);
}

export interface DshPanelHandle {
  open(): void;
}

export function installDshPanel(): DshPanelHandle {
  const panel = query<HTMLElement>('dsh-panel');
  const openButton = query<HTMLButtonElement>('btn-dsh');
  const closeButton = query<HTMLButtonElement>('dsh-close');
  const status = query<HTMLElement>('dsh-status');
  const dot = query<HTMLElement>('dsh-dot');
  const urlInput = query<HTMLInputElement>('dsh-url');
  const tokenInput = query<HTMLInputElement>('dsh-token');
  const toggleToken = query<HTMLButtonElement>('dsh-toggle-token');
  const copyToken = query<HTMLButtonElement>('dsh-copy-token');
  const enableButton = query<HTMLButtonElement>('dsh-enable');
  const disableButton = query<HTMLButtonElement>('dsh-disable');
  const copyButton = query<HTMLButtonElement>('dsh-copy');
  const api = platform();
  let requestVersion = 0;
  let fullUrl = '';
  let token = '';

  const apply = (value: McpStatus): void => {
    fullUrl = value.url || '';
    token = value.token || '';
    if (urlInput) urlInput.value = fullUrl.replace(/\?.*$/, '');
    if (tokenInput) tokenInput.value = token;
    const active = Boolean(value.running);
    const failed = Boolean(value.enabled && !value.running) || Boolean(value.error);
    if (status) {
      status.textContent = active
        ? t('运行中 · 127.0.0.1:{port}', { port: value.port })
        : failed
          ? t('启动失败{error}', { error: value.error ? `：${value.error}` : '' })
          : value.enabled ? t('已启用，服务未运行') : t('未启用');
      status.className = `dsh-status${active ? ' is-on' : failed ? ' is-error' : ''}`;
    }
    dot?.classList.toggle('is-on', active);
    dot?.classList.toggle('is-error', failed);
    if (enableButton) enableButton.disabled = active;
    if (disableButton) disableButton.disabled = !active;
    if (copyButton) copyButton.disabled = !fullUrl;
    if (copyToken) copyToken.disabled = !token;
  };

  const refresh = async (): Promise<void> => {
    if (!api) return;
    const version = ++requestVersion;
    try {
      const value = await api.mcpStatus();
      if (version === requestVersion) apply(value);
    } catch (error) {
      if (status) status.textContent = String((error as Error)?.message ?? error);
    }
  };

  const copy = (text: string, label: string): void => {
    if (!text) return;
    void navigator.clipboard?.writeText(text).then(
      () => { if (status) status.textContent = label; },
      () => { if (status) status.textContent = t('复制失败'); },
    );
  };

  openButton?.addEventListener('click', () => {
    if (!panel) return;
    if (panel.hidden) {
      panel.hidden = false;
      void refresh();
    } else {
      panel.hidden = true;
    }
  });
  closeButton?.addEventListener('click', () => {
    if (panel) panel.hidden = true;
  });
  enableButton?.addEventListener('click', () => {
    if (!api) return;
    enableButton.disabled = true;
    void api.mcpEnable().then((value) => {
      requestVersion += 1;
      apply(value);
    }).catch((error) => {
      if (status) status.textContent = String((error as Error)?.message ?? error);
    });
  });
  disableButton?.addEventListener('click', () => {
    if (!api) return;
    disableButton.disabled = true;
    void api.mcpDisable().then((value) => {
      requestVersion += 1;
      apply(value);
    }).catch((error) => {
      if (status) status.textContent = String((error as Error)?.message ?? error);
    });
  });
  toggleToken?.addEventListener('click', () => {
    if (!tokenInput) return;
    const hidden = tokenInput.type === 'password';
    tokenInput.type = hidden ? 'text' : 'password';
    toggleToken.textContent = hidden ? t('隐藏') : t('显示');
  });
  copyButton?.addEventListener('click', () => copy(fullUrl, t('连接地址已复制')));
  copyToken?.addEventListener('click', () => copy(token, t('访问令牌已复制')));

  void refresh();
  return {
    open: () => {
      if (!panel) return;
      panel.hidden = false;
      void refresh();
    },
  };
}
