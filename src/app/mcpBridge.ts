import { createBlock, type Block } from '../core/types.js';
import { selectMany } from '../core/selection.js';
import { platform, type McpCommand } from '../platform/ipc.js';
import { flushDocumentEditing } from './editorCommands.js';
import type { FileActions } from './files.js';
import { activeBlock, escapeHtml, type AppState } from './state.js';

const TEXT_TYPES = new Set(['paragraph', 'quote', 'bullet', 'number']);

function blockText(block: Block): string {
  if (block.type === 'table') return (block.meta?.rows ?? []).map((row) => row.join('\t')).join('\n');
  if (block.type === 'image') return block.meta?.caption ?? '[图片]';
  if (block.type === 'divider') return '---';
  return (block.html || '').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]*>/g, '').trim();
}

function contextOf(state: AppState): string {
  const ids = new Set(state.store.selection.blockIds);
  const selected = ids.size ? state.store.doc.blocks.filter((block) => ids.has(block.id)) : [];
  const current = selected.length ? selected : [activeBlock(state)].filter(Boolean) as Block[];
  return current.map(blockText).filter(Boolean).join('\n\n').slice(0, 12000);
}

function textHtml(text: string): string {
  return escapeHtml(text.trim()).replace(/\r?\n/g, '<br>');
}

export interface McpBridgeOptions {
  state: AppState;
  files: FileActions;
}

export function installMcpBridge({ state, files }: McpBridgeOptions): void {
  const api = platform();
  if (!api) return;
  let queue = Promise.resolve();

  const execute = async (command: string, args: Record<string, unknown>): Promise<unknown> => {
    const { store } = state;
    flushDocumentEditing(state);
    const current = activeBlock(state);
    if (command === 'notebook_get_status') {
      return {
        title: store.doc.title,
        filePath: state.filePath,
        dirty: state.dirty,
        blocks: store.doc.blocks.length,
        selected: store.selection.blockIds.length,
        activeId: store.selection.activeId,
      };
    }
    if (command === 'notebook_get_context') {
      return {
        title: store.doc.title,
        blockCount: store.doc.blocks.length,
        activeId: store.selection.activeId,
        blockIds: [...store.selection.blockIds],
        context: contextOf(state),
      };
    }
    if (command === 'notebook_save') {
      if (!state.filePath) throw new Error('文档还没有保存路径，请先在应用中另存为');
      const saved = await files.save();
      if (!saved) throw new Error('保存失败');
      return { saved: true, path: state.filePath };
    }
    if (command === 'notebook_replace_selection') {
      const text = String(args.text ?? '').trim();
      if (!text) throw new Error('替换文本不能为空');
      const ids = store.selection.blockIds;
      const block = ids.length === 1 ? store.doc.blocks.find((item) => item.id === ids[0]) : undefined;
      if (!block || !TEXT_TYPES.has(block.type)) {
        throw new Error('请只选中一个文本块后再替换');
      }
      store.dispatch(() => [{ t: 'patchBlock', id: block.id, patch: { html: textHtml(text) } }]);
      return { ok: true, blockId: block.id };
    }
    if (command === 'notebook_insert_text') {
      const text = String(args.text ?? '').trim();
      if (!text) throw new Error('插入文本不能为空');
      const target = String(args.target || 'current');
      const html = textHtml(text);
      if (target === 'current' && current && TEXT_TYPES.has(current.type)) {
        store.dispatch(() => [{
          t: 'patchBlock',
          id: current.id,
          patch: { html: current.html ? `${current.html}<br>${html}` : html },
        }]);
        return { ok: true, blockId: current.id, target: 'current' };
      }
      const block = createBlock('paragraph', html);
      const after = target === 'after' && current
        ? store.doc.blocks.findIndex((item) => item.id === current.id) + 1
        : store.doc.blocks.length;
      store.dispatch((doc) => [{
        t: 'insertBlocks',
        at: Math.max(0, Math.min(after, doc.blocks.length)),
        blocks: [block],
      }], selectMany([block.id]));
      return { ok: true, blockId: block.id, target: target === 'after' ? 'after' : 'end' };
    }
    throw new Error(`未知命令：${command}`);
  };

  api.onMcpCommand((command: McpCommand) => {
    queue = queue.then(async () => {
      try {
        const result = await execute(command.name, command.args || {});
        api.mcpResult({ id: command.id, ok: true, result });
      } catch (error) {
        api.mcpResult({ id: command.id, ok: false, error: String((error as Error)?.message ?? error) });
      }
    });
  });
}
