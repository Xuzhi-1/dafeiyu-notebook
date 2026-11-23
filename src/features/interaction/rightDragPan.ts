/** 空白区域按住右键上下拖动：直接平移正文滚动容器。 */

interface DragState {
  pointerId: number;
  startY: number;
  startScrollTop: number;
  moved: boolean;
}

export function installRightDragPan(workspace: HTMLElement): () => void {
  let drag: DragState | null = null;

  const isBlank = (target: Element): boolean => (
    workspace.contains(target)
    && !target.closest('.block, [data-comment-ui], #outline, .toolbar, button, input, textarea, select')
  );

  const onContextMenu = (event: MouseEvent): void => {
    const target = event.target;
    if (target instanceof Element && isBlank(target)) event.preventDefault();
  };

  const removeMoveListeners = (): void => {
    document.removeEventListener('pointermove', onMove, true);
    document.removeEventListener('pointerup', onUp, true);
    document.removeEventListener('pointercancel', onCancel, true);
    window.removeEventListener('blur', onCancel);
  };

  const end = (): void => {
    const current = drag;
    drag = null;
    removeMoveListeners();
    if (!current) return;
    try {
      workspace.releasePointerCapture(current.pointerId);
    } catch {
      /* 指针已释放 */
    }
    workspace.classList.remove('is-panning');
  };

  const onMove = (event: PointerEvent): void => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const dy = event.clientY - drag.startY;
    if (!drag.moved && Math.abs(dy) < 3) return;
    if (!drag.moved) {
      drag.moved = true;
      workspace.classList.add('is-panning');
    }
    event.preventDefault();
    workspace.scrollTop = drag.startScrollTop - dy;
  };

  const onUp = (event: PointerEvent): void => {
    if (drag && event.pointerId === drag.pointerId) end();
  };

  const onCancel = (): void => end();

  const onPointerDown = (event: PointerEvent): void => {
    if (event.button !== 2 || event.pointerType !== 'mouse' || drag) return;
    const target = event.target;
    if (!(target instanceof Element) || !isBlank(target)) return;
    event.preventDefault();
    drag = {
      pointerId: event.pointerId,
      startY: event.clientY,
      startScrollTop: workspace.scrollTop,
      moved: false,
    };
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
  workspace.addEventListener('contextmenu', onContextMenu, true);

  return () => {
    end();
    workspace.removeEventListener('pointerdown', onPointerDown);
    workspace.removeEventListener('contextmenu', onContextMenu, true);
  };
}
