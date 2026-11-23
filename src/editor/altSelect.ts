/**
 * Alt 区块选择守卫：只管输入层，不改业务数据。
 * 按住 Alt 时禁用正文焦点/输入和把手拖动，允许框选。
 */

export interface AltSelectOptions {
  shouldSuppress?: () => boolean;
}

let active = false;
let suppressed = false;
let installed = false;

export function isAltSelecting(): boolean {
  return active;
}

export function isAltSuppressed(): boolean {
  return suppressed;
}

/** 指针事件兜底：如果 keydown 丢失，event.altKey 仍可生效。 */
export function altSelectionActive(eventAltKey = false): boolean {
  return active || (eventAltKey && !suppressed);
}

export function installAltSelection(options: AltSelectOptions = {}): void {
  if (installed) return;
  installed = true;

  const shouldSuppress = options.shouldSuppress ?? (() => false);

  const reset = (): void => {
    active = false;
    suppressed = false;
    document.body.classList.remove('is-alt-selecting', 'alt-held');
  };

  const enter = (): void => {
    if (shouldSuppress()) {
      active = false;
      suppressed = true;
      document.body.classList.remove('is-alt-selecting', 'alt-held');
      return;
    }
    active = true;
    suppressed = false;
    document.body.classList.add('is-alt-selecting', 'alt-held');
    const focused = document.activeElement;
    if (focused instanceof HTMLElement && focused.isContentEditable) focused.blur();
  };

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Alt') {
      if (event.repeat) return;
      if (event.getModifierState('AltGraph')) {
        reset();
        return;
      }
      enter();
      event.preventDefault();
      return;
    }
    if (event.key === 'Escape' && active) {
      reset();
    }
  }, true);

  document.addEventListener('keyup', (event) => {
    if (event.key === 'Alt') reset();
  }, true);

  document.addEventListener('beforeinput', (event) => {
    const target = event.target;
    if (active && target instanceof HTMLElement && target.isContentEditable) {
      event.preventDefault();
    }
  }, true);

  document.addEventListener('pointerdown', (event) => {
    if (active && !event.altKey) reset();
  }, true);

  document.addEventListener('pointermove', (event) => {
    if (active && !event.altKey) reset();
  }, true);

  window.addEventListener('blur', reset);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') reset();
  });
}
