/**
 * 拖拽/框选用到的覆盖层与类名清理。
 * 所有创建、移除、类名开关集中在这里，避免各控制器各清一半。
 */

export function createMarqueeBox(host: HTMLElement): HTMLElement {
  const box = document.createElement('div');
  box.className = 'marquee';
  host.appendChild(box);
  return box;
}

export function createDropLine(host: HTMLElement): HTMLElement {
  const line = document.createElement('div');
  line.className = 'drop-line';
  line.hidden = true;
  host.appendChild(line);
  return line;
}

export function setBodyDragging(active: boolean): void {
  document.body.classList.toggle('is-dragging', active);
  document.body.classList.toggle('is-block-dragging', active);
}

export function clearOutlineMarks(outline: HTMLElement | null): void {
  if (!outline) return;
  outline.querySelectorAll('.drop-before, .drop-after, .drop-inside').forEach((el) => {
    el.classList.remove('drop-before', 'drop-after', 'drop-inside');
  });
  outline.querySelector('[data-toc-tail]')?.classList.remove('is-active');
  outline.classList.remove('is-drop-target');
}
