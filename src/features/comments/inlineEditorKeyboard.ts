/** 注释编辑器键盘：Enter 提交、Shift+Enter 换行、Escape 取消。 */

export interface InlineKeyboardHandlers {
  save(): void;
  cancel(): void;
  isDraft(): boolean;
  isDirty(): boolean;
}

function insertLineBreak(): void {
  // 使用原生编辑命令，保留浏览器撤销栈；零宽字符保证末尾出现可见行。
  document.execCommand('insertHTML', false, '<br>\u200b');
}

export function attachInlineKeyboard(text: HTMLElement, handlers: InlineKeyboardHandlers): () => void {
  const onKeyDown = (event: KeyboardEvent): void => {
    const key = event.key.toLowerCase();
    const undoKey = (event.ctrlKey || event.metaKey) && (key === 'z' || key === 'y');
    if (event.isComposing || event.keyCode === 229) {
      if (undoKey) event.stopPropagation();
      return;
    }
    if (undoKey) {
      // 空草稿没有可撤销内容：既不能关闭编辑器，也不能误撤销文档。
      if (key === 'z' && !event.shiftKey && handlers.isDraft() && !text.textContent?.trim()) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      if (!handlers.isDirty()) return;
      event.stopPropagation();
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      handlers.cancel();
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (event.shiftKey) {
        insertLineBreak();
        return;
      }
      handlers.save();
    }
  };
  text.addEventListener('keydown', onKeyDown);
  return () => text.removeEventListener('keydown', onKeyDown);
}
