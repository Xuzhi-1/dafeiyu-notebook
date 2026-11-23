/** 搜索结果元信息：只负责区块标记，不生成摘要。 */

import { markInfoForBlock } from '../core/notes.js';
import type { Doc, Mark } from '../core/types.js';

export interface SearchMeta {
  readonly mark?: Mark;
  readonly markGroupId?: string;
}

export { markGlyph } from '../core/markGlyph.js';

export function searchMetaFor(doc: Doc, blockId: string): SearchMeta {
  const info = markInfoForBlock(doc, blockId);
  return { mark: info.badge ?? info.group, markGroupId: info.groupKey };
}
