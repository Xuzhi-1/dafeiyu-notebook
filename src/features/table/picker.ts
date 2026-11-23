/** 9×9 表格尺寸选择器；网格只是选尺寸，不默认插入 9×9。 */

import { t } from '../../i18n/index.js';

export interface TableSize {
  rows: number;
  columns: number;
}

export class TablePicker {
  private readonly panel: HTMLElement;
  private readonly label: HTMLElement;
  private readonly cells: HTMLButtonElement[] = [];
  private readonly rowsInput: HTMLInputElement;
  private readonly columnsInput: HTMLInputElement;

  constructor(
    private readonly anchor: HTMLElement,
    private readonly onPick: (size: TableSize) => void,
  ) {
    this.panel = document.createElement('div');
    this.panel.className = 'table-picker';
    this.panel.tabIndex = -1;
    this.panel.hidden = true;

    const head = document.createElement('div');
    head.className = 'table-picker-head';
    this.label = document.createElement('span');
    this.label.textContent = t('选择表格大小');
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'table-picker-close';
    close.textContent = '×';
    close.title = t('关闭');
    close.addEventListener('click', () => this.close());
    head.append(this.label, close);

    const grid = document.createElement('div');
    grid.className = 'table-picker-grid';
    grid.addEventListener('pointerleave', () => this.clearPreview());
    for (let row = 1; row <= 9; row += 1) {
      for (let column = 1; column <= 9; column += 1) {
        const cell = document.createElement('button');
        cell.type = 'button';
        cell.dataset.row = String(row);
        cell.dataset.column = String(column);
        cell.title = `${row} × ${column}`;
        cell.addEventListener('pointerenter', () => this.preview(row, column));
        cell.addEventListener('click', () => {
          this.onPick({ rows: row, columns: column });
          this.close();
        });
        this.cells.push(cell);
        grid.appendChild(cell);
      }
    }

    const customTitle = document.createElement('div');
    customTitle.className = 'table-picker-custom-title';
    customTitle.textContent = t('自定义');

    const custom = document.createElement('div');
    custom.className = 'table-picker-custom';
    const rowsLabel = document.createElement('span');
    rowsLabel.textContent = t('行');
    this.rowsInput = this.makeCountInput();
    const columnsLabel = document.createElement('span');
    columnsLabel.textContent = t('列');
    this.columnsInput = this.makeCountInput();
    const apply = document.createElement('button');
    apply.type = 'button';
    apply.className = 'table-picker-apply';
    apply.textContent = t('插入');
    apply.addEventListener('click', () => {
      const rows = Number(this.rowsInput.value);
      const columns = Number(this.columnsInput.value);
      if (!Number.isFinite(rows) || rows < 1 || !Number.isFinite(columns) || columns < 1) {
        (rows < 1 || !Number.isFinite(rows) ? this.rowsInput : this.columnsInput).focus();
        return;
      }
      this.onPick({ rows, columns });
      this.close();
    });
    custom.append(rowsLabel, this.rowsInput, columnsLabel, this.columnsInput, apply);

    this.panel.append(head, grid, customTitle, custom);
    this.panel.addEventListener('pointerdown', (event) => event.stopPropagation());
    document.body.appendChild(this.panel);

    document.addEventListener('pointerdown', (event) => {
      if (this.panel.hidden) return;
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (this.panel.contains(target) || this.anchor.contains(target)) return;
      this.close();
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !this.panel.hidden) this.close();
    });
  }

  toggle(): void {
    if (this.panel.hidden) this.open();
    else this.close();
  }

  close(): void {
    this.panel.hidden = true;
    this.clearPreview();
  }

  private clearPreview(): void {
    this.label.textContent = t('选择表格大小');
    for (const cell of this.cells) cell.classList.remove('is-active');
  }

  private open(): void {
    this.panel.hidden = false;
    this.rowsInput.value = '';
    this.columnsInput.value = '';
    this.clearPreview();
    this.panel.focus({ preventScroll: true });
    const rect = this.anchor.getBoundingClientRect();
    const width = this.panel.offsetWidth;
    this.panel.style.left = `${Math.max(8, Math.min(window.innerWidth - width - 8, rect.left))}px`;
    this.panel.style.top = `${rect.bottom + 6}px`;
    this.label.textContent = t('选择表格大小');
  }

  private preview(rows: number, columns: number): void {
    this.label.textContent = `${rows} × ${columns}`;
    for (const cell of this.cells) {
      const row = Number(cell.dataset.row);
      const column = Number(cell.dataset.column);
      cell.classList.toggle('is-active', row <= rows && column <= columns);
    }
  }

  private makeCountInput(): HTMLInputElement {
    const input = document.createElement('input');
    input.type = 'number';
    input.min = '1';
    input.max = '50';
    input.inputMode = 'numeric';
    input.addEventListener('pointerdown', (event) => event.stopPropagation());
    return input;
  }
}
