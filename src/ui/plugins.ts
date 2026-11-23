/** 插件管理面板：列出插件、启停、删除、拖动排序、打开目录、重新加载。 */

import type { PluginHost } from '../plugins/host.js';
import { readDisabled, writeDisabled } from '../plugins/host.js';
import { openContextMenu } from './contextMenu.js';
import { t } from '../i18n/index.js';

export interface PluginPanelOptions {
  onReload: () => Promise<void>;
  onDelete: (id: string) => Promise<boolean>;
  onReorder: (ids: string[]) => void;
}

export class PluginPanel {
  private busy = false;
  private dragId: string | null = null;
  private renderScheduled = false;
  private focusToggleId: string | null = null;

  constructor(
    private readonly host: HTMLElement,
    private readonly pluginHost: PluginHost,
    private readonly options: PluginPanelOptions,
  ) {
    this.host.addEventListener('click', this.onClick);
    this.host.addEventListener('change', this.onChange);
    this.host.addEventListener('contextmenu', this.onContextMenu);
    this.host.addEventListener('dragstart', this.onDragStart);
    this.host.addEventListener('dragover', this.onDragOver);
    this.host.addEventListener('drop', this.onDrop);
    this.host.addEventListener('dragend', this.onDragEnd);
    document.addEventListener('pointerdown', (event) => {
      if (this.host.hidden) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest('#plugins, #btn-plugins, .context-menu')) return;
      this.host.hidden = true;
    }, true);
  }

  toggle(): void {
    this.host.hidden = !this.host.hidden;
    if (!this.host.hidden) this.render();
  }

  render(): void {
    if (this.host.hidden || this.renderScheduled) return;
    this.renderScheduled = true;
    queueMicrotask(() => {
      this.renderScheduled = false;
      if (!this.host.hidden) this.paint();
    });
  }

  private paint(): void {
    const scrollTop = this.host.scrollTop;
    const disabled = readDisabled();
    const failures = new Map(this.pluginHost.failures.map((item) => [item.id, item.error]));
    const listError = failures.get('plugins');
    const hiddenCount = this.pluginHost.hiddenIds().length;
    const rows = this.pluginHost.manifests.length
      ? this.pluginHost.manifests.map((manifest) => {
        const error = failures.get(manifest.id);
        const id = escapeAttr(manifest.id);
        return `<div class="plugin-row" data-plugin-row="${id}">
          <span class="plugin-drag" data-plugin-drag draggable="${this.busy ? 'false' : 'true'}" title="${t('拖动排序')}" aria-hidden="true">⠿</span>
          <label class="plugin-main">
            <input type="checkbox" data-plugin-toggle="${id}" ${disabled[manifest.id] ? '' : 'checked'} ${this.busy ? 'disabled' : ''} />
            <span class="plugin-meta">
              <span class="plugin-name">${escapeHtml(manifest.name)}<small>v${escapeHtml(manifest.version)}</small></span>
              <span class="plugin-desc">${escapeHtml(manifest.description || t('（没有说明）'))}</span>
              ${error ? `<span class="plugin-error">${t('加载失败：{error}', { error: escapeHtml(error) })}</span>` : ''}
            </span>
          </label>
        </div>`;
      }).join('')
      : `<p class="plugin-empty">${listError ? t('插件目录读取失败：{error}', { error: escapeHtml(listError) }) : hiddenCount ? t('当前插件已全部隐藏。点「显示隐藏」恢复。') : t('插件目录里还没有插件。点「打开目录」放进去后再重新加载。')}</p>`;

    this.host.innerHTML = `
      <div class="plugins-head"><strong>${t('插件（{count}）', { count: this.pluginHost.manifests.length })}</strong></div>
      <div class="plugin-list">${rows}</div>
      <div class="plugins-actions">
        ${hiddenCount ? `<button type="button" data-plugins-restore>${t('显示隐藏（{count}）', { count: hiddenCount })}</button>` : ''}
        <button type="button" data-plugins-open>${t('打开目录')}</button>
        <button type="button" data-plugins-reload ${this.busy ? 'disabled' : ''}>${t('重新加载')}</button>
        <button type="button" data-plugins-close>${t('关闭')}</button>
      </div>`;
    this.host.scrollTop = scrollTop;
    if (this.focusToggleId) {
      const input = [...this.host.querySelectorAll<HTMLInputElement>('[data-plugin-toggle]')]
        .find((item) => item.dataset.pluginToggle === this.focusToggleId);
      if (!input) this.focusToggleId = null;
      else if (!input.disabled) {
        input.focus({ preventScroll: true });
        this.focusToggleId = null;
      }
    }
  }

  private async run(action: () => Promise<void>): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    this.render();
    try {
      await action();
    } catch (error) {
      console.error('plugin panel action failed', error);
    } finally {
      this.busy = false;
      this.render();
    }
  }

  private onClick = async (event: MouseEvent): Promise<void> => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (target.closest('[data-plugins-close]')) { this.host.hidden = true; return; }
    if (target.closest('[data-plugins-open]')) { await window.moye?.plugins?.openDir?.(); return; }
    if (target.closest('[data-plugins-restore]')) {
      await this.run(async () => {
        this.pluginHost.restoreHidden();
        await this.options.onReload();
      });
      return;
    }
    if (target.closest('[data-plugins-reload]')) {
      await this.run(() => this.options.onReload());
    }
  };

  private onChange = async (event: Event): Promise<void> => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement) || !target.dataset.pluginToggle) return;
    if (this.busy) return;
    const id = target.dataset.pluginToggle;
    this.focusToggleId = id;
    const map = readDisabled();
    if (target.checked) delete map[id];
    else map[id] = true;
    writeDisabled(map);
    await this.run(() => this.options.onReload());
  };

  private onContextMenu = (event: MouseEvent): void => {
    if (this.busy) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    const row = target.closest<HTMLElement>('[data-plugin-row]');
    const id = row?.dataset.pluginRow;
    if (!id) return;
    event.preventDefault();
    const manifest = this.pluginHost.manifests.find((item) => item.id === id);
    const builtin = manifest?.source === 'builtin';
    openContextMenu([{
      label: builtin ? t('隐藏内置插件') : t('删除插件'),
      danger: !builtin,
      onSelect: () => {
        void this.run(async () => {
          if (builtin) {
            this.pluginHost.hide(id);
            await this.options.onReload();
            return;
          }
          const ok = await this.options.onDelete(id);
          if (ok) await this.options.onReload();
        });
      },
    }], event.clientX, event.clientY);
  };

  private onDragStart = (event: DragEvent): void => {
    if (this.busy) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    const handle = target.closest<HTMLElement>('[data-plugin-drag]');
    const row = handle?.closest<HTMLElement>('[data-plugin-row]');
    const id = row?.dataset.pluginRow;
    if (!handle || !row || !id) return;
    this.dragId = id;
    row.classList.add('is-dragging');
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', id);
    }
  };

  private onDragOver = (event: DragEvent): void => {
    if (!this.dragId) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    const row = target.closest<HTMLElement>('[data-plugin-row]');
    if (!row) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    this.clearDropMarks();
    row.classList.add('is-drop-target');
  };

  private onDrop = (event: DragEvent): void => {
    const target = event.target;
    if (!(target instanceof Element) || !this.dragId) return;
    const row = target.closest<HTMLElement>('[data-plugin-row]');
    const targetId = row?.dataset.pluginRow;
    if (!row || !targetId || targetId === this.dragId) { this.onDragEnd(); return; }
    event.preventDefault();
    const ids = this.pluginHost.manifests.map((item) => item.id);
    const from = ids.indexOf(this.dragId);
    if (from < 0) { this.onDragEnd(); return; }
    ids.splice(from, 1);
    let to = ids.indexOf(targetId);
    if (to < 0) { this.onDragEnd(); return; }
    const rect = row.getBoundingClientRect();
    if (event.clientY > rect.top + rect.height / 2) to += 1;
    ids.splice(to, 0, this.dragId);
    this.options.onReorder(ids);
    this.onDragEnd();
  };

  private onDragEnd = (): void => {
    this.dragId = null;
    this.clearDropMarks();
    this.host.querySelectorAll('.plugin-row.is-dragging').forEach((row) => row.classList.remove('is-dragging'));
  };

  private clearDropMarks(): void {
    this.host.querySelectorAll('.plugin-row.is-drop-target').forEach((row) => row.classList.remove('is-drop-target'));
  }
}

function escapeHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function escapeAttr(value: string): string {
  return escapeHtml(value).replaceAll('"', '&quot;');
}
