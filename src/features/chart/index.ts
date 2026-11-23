import type { Store } from '../../core/store.js';
import { resolveBlockPlacement } from '../../core/blockPlacement.js';
import { createBlock, type Block, type ChartKind } from '../../core/types.js';
import { chartFromTable, emptyChart, normalizeChart } from '../../core/chart.js';
import { selectMany } from '../../core/selection.js';
import { openContextMenu } from '../../ui/contextMenu.js';
import type { BlockRenderer } from '../../editor/render.js';
import { openChartEditor } from './editor.js';
import { blockActionItems, type BlockMenuActions } from '../blocks/menu.js';

const CHART_LABELS: Record<ChartKind, string> = {
  bar: '柱状图',
  line: '折线图',
  pie: '饼图',
};

export function insertChartFromTable(store: Store, tableId: string, kind: ChartKind = 'bar'): string | null {
  const table = store.doc.blocks.find((block) => block.id === tableId);
  if (!table || table.type !== 'table') return null;
  const chart = chartFromTable(table, kind);
  if (!chart) return null;
  const block: Block = {
    ...createBlock('chart'),
    meta: { chart: { ...chart, title: table.meta?.caption || '' } },
  };
  const at = store.doc.blocks.findIndex((item) => item.id === tableId) + 1;
  store.dispatch((doc) => [{ t: 'insertBlocks', at: Math.min(at, doc.blocks.length), blocks: [block] }], selectMany([block.id]));
  return block.id;
}

function patchChart(store: Store, block: Block, chart: unknown): void {
  const value = normalizeChart(chart);
  store.dispatch(() => [{
    t: 'patchBlock',
    id: block.id,
    patch: { meta: { ...(block.meta ?? {}), chart: value } },
  }]);
}

export function attachChartMenu(store: Store, host: HTMLElement, actions: BlockMenuActions): void {
  host.addEventListener('contextmenu', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const el = target.closest<HTMLElement>('.block-chart');
    const blockId = el?.dataset.id;
    if (!el || !blockId) return;
    const block = store.doc.blocks.find((item) => item.id === blockId);
    if (!block || block.type !== 'chart') return;
    const chart = normalizeChart(block.meta?.chart);
    if (!store.selection.blockIds.includes(blockId)) store.setSelection(selectMany([blockId]));
    event.preventDefault();
    event.stopPropagation();
    const refresh = (): void => {
      if (!chart.source) return;
      const table = store.doc.blocks.find((item) => item.id === chart.source?.tableId);
      if (!table || table.type !== 'table') return;
      const next = chartFromTable(table, chart.kind);
      if (next) patchChart(store, block, { ...next, title: chart.title });
    };
    openContextMenu([
      { label: '刷新图表', disabled: !chart.source, onSelect: refresh },
      { separator: true, label: '' },
      ...(['bar', 'line', 'pie'] as const).map((kind) => ({
        label: CHART_LABELS[kind],
        disabled: chart.kind === kind,
        onSelect: () => patchChart(store, block, { ...chart, kind }),
      })),
      ...blockActionItems(actions, true),
    ], event.clientX, event.clientY);
  });
}

export interface ChartFeatureDeps {
  store: Store;
  host: HTMLElement;
  renderer: BlockRenderer;
  toast: (message: string) => void;
  actions: BlockMenuActions;
}

export function insertChartForSelection({ store, renderer, toast }: ChartFeatureDeps, kind: ChartKind): string | null {
  const placement = resolveBlockPlacement(store.doc, store.selection.blockIds);
  const target = placement?.target;
  if (target?.type === 'table') {
    const id = insertChartFromTable(store, target.id, kind);
    if (!id) toast('表格至少需要两行两列');
    return id;
  }
  if (placement?.replace && target) {
    store.dispatch(() => [{
      t: 'patchBlock',
      id: target.id,
      patch: { type: 'chart', html: '', meta: { chart: emptyChart(kind) } },
    }], selectMany([target.id]));
    renderer.refreshBlock(target.id);
    openChartEditor(store, target.id);
    return target.id;
  }
  const block: Block = { ...createBlock('chart'), meta: { chart: emptyChart(kind) } };
  const at = placement ? placement.index : store.doc.blocks.length;
  store.dispatch((doc) => [{ t: 'insertBlocks', at: Math.min(at, doc.blocks.length), blocks: [block] }], selectMany([block.id]));
  openChartEditor(store, block.id);
  return block.id;
}

export function installChartFeature({ store, host, renderer, toast, actions }: ChartFeatureDeps): void {
  attachChartMenu(store, host, actions);
  const button = document.querySelector<HTMLButtonElement>('#btn-chart');
  button?.addEventListener('mousedown', (event) => event.preventDefault());
  button?.addEventListener('click', () => {
    insertChartForSelection({ store, host, renderer, toast, actions }, 'bar');
  });
}
