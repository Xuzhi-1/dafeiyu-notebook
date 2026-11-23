/** comments 提供给搜索展示的适配器；搜索模块不再直接依赖 comments 实现。 */

import type { SearchCommentPort } from '../../core/search.js';
import { groupCommentsForBlock } from './model.js';
import { commentToHtml } from './sanitizeComment.js';

export function createSearchCommentPort(): SearchCommentPort {
  return {
    groupForBlock(doc, blockId) {
      const group = groupCommentsForBlock(doc, blockId)[0];
      return group ? { id: group.id, color: group.color } : undefined;
    },
    render(note): string {
      const rich = note.format === 'html' || /<span\b/i.test(note.html);
      return commentToHtml(note.html, rich);
    },
  };
}
