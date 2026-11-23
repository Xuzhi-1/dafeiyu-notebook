/**
 * 块级指针手势的公共类型。
 * Router 只关心“开始一个手势 / 移动 / 结束 / 取消”，
 * 具体逻辑在 marquee / blockDrag / tap 中。
 */

import type { Store } from '../../core/store.js';
import type { TocDropTarget } from '../../core/toc.js';

export interface PointerContext {
  readonly store: Store;
  readonly host: HTMLElement;
  readonly options: {
    onDropToOutline?: (ids: string[], target: TocDropTarget | null) => void;
  };
}

export interface Gesture {
  move(event: PointerEvent): void;
  finish(event: PointerEvent): void;
  cancel(): void;
  /** 是否发生过有效移动（用于拖拽后抑制 click） */
  moved(): boolean;
}
