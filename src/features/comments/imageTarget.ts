/** 注释图片目标：把注释图片适配成通用图片编辑目标。 */

import type { Store } from '../../core/store.js';
import type { CommentAnnotation } from '../../core/types.js';
import { removeCommentImageOp, updateCommentImageOp } from '../../core/notes.js';
import type { ImageTarget } from '../image/target.js';

export function commentImageTarget(store: Store, noteId: string, index: number): ImageTarget | null {
  const note = (): CommentAnnotation | null => {
    const found = store.doc.annotations.find((item) => item.type === 'comment' && item.id === noteId);
    return found?.type === 'comment' ? found : null;
  };
  if (!note()?.images?.[index]) return null;
  return {
    get src() {
      return note()?.images?.[index] ?? '';
    },
    get width() {
      return note()?.imageWidths?.[index] ?? 100;
    },
    get align() {
      return note()?.imageAligns?.[index] ?? 'left';
    },
    update(patch) {
      return store.dispatch(() => updateCommentImageOp(store.doc, noteId, index, patch));
    },
    remove() {
      return store.dispatch(() => removeCommentImageOp(store.doc, noteId, index));
    },
  };
}
