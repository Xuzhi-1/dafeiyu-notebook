export interface CellRange {
  top: number;
  left: number;
  bottom: number;
  right: number;
}

interface CellPoint {
  row: number;
  column: number;
}

const SELECTED = 'is-cell-selected';

function cellPoint(cell: HTMLElement): CellPoint | null {
  const row = Number(cell.dataset.row);
  const column = Number(cell.dataset.column);
  return Number.isInteger(row) && Number.isInteger(column) ? { row, column } : null;
}

function cells(host: HTMLElement): HTMLElement[] {
  return [...host.querySelectorAll<HTMLElement>('.doc-table td[data-row], .doc-table th[data-row]')];
}

export function clearCellSelection(host: HTMLElement): void {
  for (const cell of cells(host)) cell.classList.remove(SELECTED);
}

export function selectedCellRange(host: HTMLElement): CellRange | null {
  const selected = cells(host).filter((cell) => cell.classList.contains(SELECTED));
  if (!selected.length) return null;
  const points = selected.map(cellPoint).filter((point): point is CellPoint => Boolean(point));
  if (!points.length) return null;
  return {
    top: Math.min(...points.map((point) => point.row)),
    left: Math.min(...points.map((point) => point.column)),
    bottom: Math.max(...points.map((point) => point.row)),
    right: Math.max(...points.map((point) => point.column)),
  };
}

export function attachTableCellSelection(host: HTMLElement): void {
  let anchor: CellPoint | null = null;

  const paint = (focus: CellPoint): void => {
    clearCellSelection(host);
    if (!anchor) return;
    const top = Math.min(anchor.row, focus.row);
    const left = Math.min(anchor.column, focus.column);
    const bottom = Math.max(anchor.row, focus.row);
    const right = Math.max(anchor.column, focus.column);
    for (const cell of cells(host)) {
      const point = cellPoint(cell);
      if (!point) continue;
      if (point.row >= top && point.row <= bottom && point.column >= left && point.column <= right) {
        cell.classList.add(SELECTED);
      }
    }
  };

  host.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    const cell = target.closest<HTMLElement>('.doc-table td[data-row], .doc-table th[data-row]');
    if (!cell) return;
    const point = cellPoint(cell);
    if (!point) return;
    if (event.shiftKey && anchor) {
      event.preventDefault();
      cell.focus({ preventScroll: true });
      paint(point);
      return;
    }
    anchor = point;
    clearCellSelection(host);
  }, true);

  document.addEventListener('pointerdown', (event) => {
    const target = event.target;
    if (target instanceof Element && target.closest('.doc-table')) return;
    anchor = null;
    clearCellSelection(host);
  }, true);
}
