/**
 * 注释槽位顺序的唯一来源。
 * 行内编辑器已经在注释行内，不再需要额外的 editor/after 槽位。
 */

export type CommentSlotKind = 'block-comments' | 'group-comments';

export const COMMENT_SLOT_ORDER: Record<CommentSlotKind, number> = {
  'block-comments': 10,
  'group-comments': 20,
};

export function commentSlotOrder(kind: CommentSlotKind): number {
  return COMMENT_SLOT_ORDER[kind];
}
