/** 从左右灰色空白拖入正文时的框选入口，框选宿主使用 workspace。 */

import type { Store } from '../../core/store.js';
import { startMarquee } from '../../editor/pointer/marquee.js';
import type { Gesture } from '../../editor/pointer/types.js';

interface ActiveMarquee {
  pointerId: number;
  gesture: Gesture;
}

export function installSideMarquee(store: Store, workspace: HTMLElement): () => void {
  let active: ActiveMarquee | null = null;

  const end = (finish: boolean): void => {
    const current = active;
    active = null;
    document.removeEventListener('pointermove', onMove, true);
    document.removeEventListener('pointerup', onUp, true);
    document.removeEventListener('pointercancel', onCancel, true);
    window.removeEventListener('blur', onCancel);
    if (!current) return;
    try {
      workspace.releasePointerCapture(current.pointerId);
    } catch {
      /* 指针已释放 */
    }
    if (finish) current.gesture.cancel();
  };

  const onMove = (event: PointerEvent): void => {
    if (active && event.pointerId === active.pointerId) active.gesture.move(event);
  };

  const onUp = (event: PointerEvent): void => {
    if (!active || event.pointerId !== active.pointerId) return;
    const current = active;
    active = null;
    document.removeEventListener('pointermove', onMove, true);
    document.removeEventListener('pointerup', onUp, true);
    document.removeEventListener('pointercancel', onCancel, true);
    window.removeEventListener('blur', onCancel);
    try {
      workspace.releasePointerCapture(current.pointerId);
    } catch {
      /* 指针已释放 */
    }
    current.gesture.finish(event);
  };

  const onCancel = (): void => end(true);

  const onPointerDown = (event: PointerEvent): void => {
    if (event.button !== 0 || active || event.target !== workspace) return;
    const rect = workspace.getBoundingClientRect();
    if (event.clientX > rect.left + workspace.clientWidth
      || event.clientY > rect.top + workspace.clientHeight) return;
    event.preventDefault();
    window.getSelection()?.removeAllRanges();
    const focused = document.activeElement;
    if (focused instanceof HTMLElement && focused.closest('.block-content, .doc-table')) focused.blur();
    const gesture = startMarquee({ store, host: workspace, options: {} }, event);
    active = { pointerId: event.pointerId, gesture };
    try {
      workspace.setPointerCapture(event.pointerId);
    } catch {
      /* 合成事件没有活动指针 */
    }
    document.addEventListener('pointermove', onMove, true);
    document.addEventListener('pointerup', onUp, true);
    document.addEventListener('pointercancel', onCancel, true);
    window.addEventListener('blur', onCancel);
  };

  workspace.addEventListener('pointerdown', onPointerDown);
  return () => {
    end(true);
    workspace.removeEventListener('pointerdown', onPointerDown);
  };
}
