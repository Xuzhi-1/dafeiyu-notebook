import type { Block, ChartKind, ChartSpec } from './types.js';
import { tableGrid } from './tableSpans.js';

export const CHART_KINDS: readonly ChartKind[] = ['bar', 'line', 'pie'];

export function emptyChart(kind: ChartKind = 'bar'): ChartSpec {
  return { kind, title: '', categories: [], series: [] };
}

function numberFromCell(value: string): number {
  const cleaned = String(value ?? '').replaceAll(',', '').replace(/[^\d.+-]/g, '');
  const number = Number.parseFloat(cleaned);
  return Number.isFinite(number) ? number : 0;
}

/** 从表格快照生成独立图表数据；不保留实时引用。 */
export function chartFromTable(block: Block, kind: ChartKind = 'bar'): ChartSpec | null {
  if (block.type !== 'table') return null;
  const grid = tableGrid(block);
  if (grid.height < 2 || grid.width < 2) return null;
  const header = grid.rows[0] ?? [];
  const categories = grid.rows.slice(1).map((row) => String(row[0] ?? '').trim());
  const series = Array.from({ length: grid.width - 1 }, (_, index) => ({
    name: String(header[index + 1] ?? `系列 ${index + 1}`).trim() || `系列 ${index + 1}`,
    values: grid.rows.slice(1).map((row) => numberFromCell(row[index + 1] ?? '')),
  }));
  return {
    kind,
    title: '',
    categories,
    series,
    source: { tableId: block.id, updatedAt: Date.now() },
  };
}

export function normalizeChart(value: unknown): ChartSpec {
  if (!value || typeof value !== 'object') return emptyChart();
  const raw = value as Partial<ChartSpec>;
  const kind: ChartKind = raw.kind === 'line' || raw.kind === 'pie' ? raw.kind : 'bar';
  const categories = Array.isArray(raw.categories) ? raw.categories.map(String).slice(0, 50) : [];
  const series = Array.isArray(raw.series)
    ? raw.series.slice(0, 12).map((item) => ({
      name: String(item?.name ?? ''),
      values: Array.isArray(item?.values)
        ? item.values.map((v: unknown) => Number.isFinite(Number(v)) ? Number(v) : 0).slice(0, 50)
        : [],
    }))
    : [];
  const title = typeof raw.title === 'string' ? raw.title.slice(0, 80) : '';
  const source = raw.source && typeof raw.source.tableId === 'string'
    ? { tableId: raw.source.tableId, updatedAt: Number(raw.source.updatedAt) || 0 }
    : undefined;
  return { kind, title, categories, series, source };
}

export function chartDataValues(spec: ChartSpec): number[] {
  return spec.series.flatMap((item) => item.values);
}
