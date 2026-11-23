import type { ContextMenuItem } from '../../ui/contextMenu.js';

export interface BlockMenuActions {
  clearSelection(): void;
  deleteSelection(): void;
  copyText?(): Promise<boolean>;
  cutText?(): Promise<boolean>;
  pasteFromMenu?(range?: Range | null): Promise<boolean>;
  pastePlainText?(range?: Range | null): Promise<boolean>;
}

export function blockActionItems(actions: BlockMenuActions, separator = false): ContextMenuItem[] {
  return [
    ...(separator ? [{ separator: true, label: '' } as const] : []),
    { label: '清空内容', onSelect: () => actions.clearSelection() },
    { label: '删除区块', danger: true, onSelect: () => actions.deleteSelection() },
  ];
}
