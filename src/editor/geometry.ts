/**
 * 纸张坐标换算：页面支持 CSS zoom，所有绝对定位的覆盖层都必须经过这里。
 * 纯函数，只依赖 DOM 几何。
 */

export function zoomOf(host: HTMLElement): number {
  const value = Number.parseFloat(getComputedStyle(host).zoom);
  return Number.isFinite(value) && value > 0 ? value : 1;
}

export function clientToLocal(host: HTMLElement, clientX: number, clientY: number): { x: number; y: number } {
  const rect = host.getBoundingClientRect();
  const zoom = zoomOf(host);
  return {
    x: (clientX - rect.left + host.scrollLeft) / zoom,
    y: (clientY - rect.top + host.scrollTop) / zoom,
  };
}

export function localToClient(host: HTMLElement, x: number, y: number): { x: number; y: number } {
  const rect = host.getBoundingClientRect();
  const zoom = zoomOf(host);
  return {
    x: rect.left + x * zoom - host.scrollLeft,
    y: rect.top + y * zoom - host.scrollTop,
  };
}
