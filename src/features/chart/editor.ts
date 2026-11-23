import type { Store } from '../../core/store.js';
import type { ChartKind, ChartSeries, ChartSpec } from '../../core/types.js';
import { normalizeChart } from '../../core/chart.js';
import { selectMany } from '../../core/selection.js';
import { t } from '../../i18n/index.js';

interface ChartDraft {
  kind: ChartKind;
  title: string;
  categories: string[];
  series: { name: string; values: number[] }[];
}

const KIND_LABELS: Record<ChartKind, string> = {
  bar: t('柱状图'),
  line: t('折线图'),
  pie: t('饼图'),
};

function esc(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

export function openChartEditor(store: Store, blockId: string): void {
  const block = store.doc.blocks.find((item) => item.id === blockId);
  if (!block || block.type !== 'chart') return;
  const initial = normalizeChart(block.meta?.chart);
  let draft: ChartDraft = {
    ...initial,
    categories: [...initial.categories],
    series: initial.series.map((series) => ({ name: series.name, values: [...series.values] })),
  };
  if (!draft.categories.length) draft.categories = [''];
  if (!draft.series.length) draft.series = [{ name: t('系列 {count}', { count: 1 }), values: draft.categories.map(() => 0) }];

  const overlay = document.createElement('div');
  overlay.className = 'chart-editor-overlay';
  document.body.appendChild(overlay);

  const close = (): void => {
    overlay.remove();
    document.removeEventListener('keydown', onKey);
  };

  const read = (): void => {
    const title = overlay.querySelector<HTMLInputElement>('[data-chart-title]');
    const kind = overlay.querySelector<HTMLSelectElement>('[data-chart-kind]');
    if (title) draft = { ...draft, title: title.value };
    if (kind) draft = { ...draft, kind: kind.value as ChartKind };
    const rows = [...overlay.querySelectorAll<HTMLElement>('[data-chart-series]')];
    const names = [...overlay.querySelectorAll<HTMLInputElement>('[data-chart-series-name]')].map((el) => el.value);
    draft = {
      ...draft,
      categories: rows.map((row) => row.querySelector<HTMLInputElement>('[data-chart-category]')?.value ?? ''),
      series: names.map((name, column) => ({
        name,
        values: rows.map((row) => {
          const number = Number(row.querySelectorAll<HTMLInputElement>('[data-chart-value]')[column]?.value ?? 0);
          return Number.isFinite(number) ? number : 0;
        }),
      })),
    };
  };

  const render = (): void => {
    const seriesCount = Math.max(1, draft.series.length);
    const gridStyle = `grid-template-columns:minmax(140px,1.4fr) repeat(${seriesCount},minmax(100px,1fr))`;
    const cardWidth = Math.min(1180, Math.max(720, 160 + seriesCount * 112));
    overlay.innerHTML = `<div class="chart-editor-card" style="width:min(${cardWidth}px,calc(100vw - 40px))" role="dialog" aria-modal="true" aria-label="${t('编辑图表')}">
      <div class="chart-editor-head"><strong>${t('编辑图表')}</strong><button type="button" class="chart-editor-close" title="${t('关闭')}">×</button></div>
      <div class="chart-editor-meta">
        <label>${t('标题')}<input data-chart-title value="${esc(draft.title)}" placeholder="${t('图表标题')}" /></label>
        <label>${t('类型')}<select data-chart-kind>${(['bar', 'line', 'pie'] as const).map((kind) => `<option value="${kind}"${draft.kind === kind ? ' selected' : ''}>${KIND_LABELS[kind]}</option>`).join('')}</select></label>
      </div>
      <div class="chart-editor-grid">
        <div class="chart-editor-row chart-editor-header" style="${gridStyle}"><span>${t('分类')}</span>${draft.series.map((series) => `<label><input data-chart-series-name value="${esc(series.name)}" aria-label="${t('系列名称')}" /></label>`).join('')}</div>
        ${draft.categories.map((category, row) => `<div class="chart-editor-row" data-chart-series style="${gridStyle}">
          <input data-chart-category value="${esc(category)}" aria-label="${t('分类')}" />
          ${draft.series.map((series) => `<input data-chart-value type="number" step="any" value="${series.values[row] ?? 0}" aria-label="${esc(series.name)} ${t('数值')}" />`).join('')}
        </div>`).join('')}
      </div>
      <div class="chart-editor-add"><button type="button" data-chart-add-category>${t('+ 分类')}</button><button type="button" data-chart-add-series>${t('+ 系列')}</button></div>
      <div class="chart-editor-actions"><button type="button" class="chart-editor-cancel">${t('取消')}</button><button type="button" class="chart-editor-apply">${t('应用')}</button></div>
    </div>`;
    overlay.querySelector('.chart-editor-close')?.addEventListener('click', close);
    overlay.querySelector('.chart-editor-cancel')?.addEventListener('click', close);
    overlay.querySelector('[data-chart-add-category]')?.addEventListener('click', () => {
      read();
      draft = {
        ...draft,
        categories: [...draft.categories, ''],
        series: draft.series.map((series) => ({ name: series.name, values: [...series.values, 0] })),
      };
      render();
    });
    overlay.querySelector('[data-chart-add-series]')?.addEventListener('click', () => {
      read();
      draft = {
        ...draft,
        series: [...draft.series, { name: t('系列 {count}', { count: draft.series.length + 1 }), values: draft.categories.map(() => 0) }],
      };
      render();
    });
    overlay.querySelector('.chart-editor-apply')?.addEventListener('click', () => {
      read();
      const series: ChartSeries[] = draft.series.map((item) => ({
        name: item.name.trim() || t('系列 {count}', { count: 1 }),
        values: draft.categories.map((_, index) => Number.isFinite(item.values[index]) ? item.values[index] : 0),
      }));
      const chart: ChartSpec = {
        kind: draft.kind,
        title: draft.title.trim(),
        categories: draft.categories.map((category) => category.trim()),
        series,
      };
      store.dispatch(() => [{
        t: 'patchBlock',
        id: blockId,
        patch: { type: 'chart', html: '', meta: { chart } },
      }], selectMany([blockId]));
      close();
    });
  };

  const onKey = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
    }
  };
  document.addEventListener('keydown', onKey);
  overlay.addEventListener('pointerdown', (event) => {
    if (event.target === overlay) close();
  });
  render();
}
