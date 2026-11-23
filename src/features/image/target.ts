/** 图片编辑目标抽象：区块图片与注释图片共用同一套菜单和变换。 */

import type { Store } from '../../core/store.js';

export type ImageAlign = 'left' | 'center' | 'right';

export interface ImageTargetPatch {
  src?: string;
  width?: number;
  align?: ImageAlign;
}

export interface ImageTarget {
  readonly src: string;
  readonly width: number;
  readonly align: ImageAlign;
  update(patch: ImageTargetPatch): boolean;
  remove(): boolean;
}

export function blockImageTarget(store: Store, blockId: string): ImageTarget | null {
  const block = (): ReturnType<typeof store.doc.blocks.find> => store.doc.blocks.find((item) => item.id === blockId);
  if (!block()) return null;
  const target: ImageTarget = {
    get src() {
      return block()?.meta?.src ?? '';
    },
    get width() {
      return block()?.meta?.width ?? 100;
    },
    get align() {
      const align = block()?.align;
      return align === 'center' || align === 'right' ? align : 'left';
    },
    update(patch) {
      const current = block();
      if (!current) return false;
      const meta = { ...(current.meta ?? {}) };
      if (patch.src !== undefined) meta.src = patch.src;
      if (patch.width !== undefined) meta.width = Math.min(100, Math.max(10, Math.round(patch.width)));
      const nextAlign = patch.align ?? current.align;
      return store.dispatch(() => [{
        t: 'patchBlock',
        id: blockId,
        patch: { align: nextAlign, meta },
      }]);
    },
    remove() {
      return store.dispatch(() => [{ t: 'removeBlocks', ids: [blockId] }]);
    },
  };
  return target;
}
