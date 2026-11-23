/** 图片右键菜单：区块图片和注释图片共用。 */

import type { Toast } from '../../app/state.js';
import { openContextMenu } from '../../ui/contextMenu.js';
import { platform } from '../../platform/ipc.js';
import { openImageCrop } from './crop.js';
import { cropImage, flipImage, type CropRect } from './ops.js';
import type { ImageTarget } from './target.js';
import { blockActionItems, type BlockMenuActions } from '../blocks/menu.js';
import { t } from '../../i18n/index.js';

export interface ImageMenuDeps {
  host: HTMLElement;
  resolveTarget: (element: Element) => ImageTarget | null;
  toast: Toast;
  onOpen?: (target: ImageTarget) => void;
  actions?: BlockMenuActions;
}

function run(promise: Promise<boolean>, toast: Toast): void {
  void promise.catch(() => toast(t('图片处理失败')));
}

async function applySource(target: ImageTarget, source: Promise<string>): Promise<boolean> {
  try {
    return target.update({ src: await source });
  } catch {
    return false;
  }
}

export function openImageMenu(target: ImageTarget, x: number, y: number, toast: Toast, actions?: BlockMenuActions): void {
  const setAlign = (align: 'left' | 'center' | 'right'): void => {
    target.update({ align });
  };
  const flip = (axis: 'horizontal' | 'vertical'): Promise<boolean> =>
    applySource(target, flipImage(target.src, axis));
  const crop = (rect: CropRect): Promise<boolean> =>
    applySource(target, cropImage(target.src, rect));
  const replace = async (): Promise<boolean> => {
    const picked = await platform()?.pickImage();
    return picked ? target.update({ src: picked.dataUrl }) : false;
  };

  openContextMenu([
    { label: t('左对齐'), checked: target.align === 'left', onSelect: () => setAlign('left') },
    { label: t('居中'), checked: target.align === 'center', onSelect: () => setAlign('center') },
    { label: t('右对齐'), checked: target.align === 'right', onSelect: () => setAlign('right') },
    { separator: true, label: '' },
    { label: t('水平翻转'), onSelect: () => run(flip('horizontal'), toast) },
    { label: t('垂直翻转'), onSelect: () => run(flip('vertical'), toast) },
    {
      label: t('裁剪…'),
      disabled: !target.src,
      onSelect: () => {
        if (!target.src) return;
        openImageCrop({ src: target.src, onConfirm: (rect) => run(crop(rect), toast) });
      },
    },
    { separator: true, label: '' },
    { label: t('恢复宽度 100%'), onSelect: () => target.update({ width: 100 }) },
    { label: t('替换图片'), onSelect: () => run(replace(), toast) },
    { separator: true, label: '' },
    { label: t('删除图片'), danger: true, onSelect: () => target.remove() },
    ...(actions ? blockActionItems(actions, true) : []),
  ], x, y);
}

export function attachImageMenu({ host, resolveTarget, toast, onOpen, actions }: ImageMenuDeps): void {
  host.addEventListener('contextmenu', (event) => {
    const element = event.target;
    if (!(element instanceof Element)) return;
    const target = resolveTarget(element);
    if (!target) return;
    event.preventDefault();
    event.stopPropagation();
    onOpen?.(target);
    openImageMenu(target, event.clientX, event.clientY, toast, actions);
  });
}
