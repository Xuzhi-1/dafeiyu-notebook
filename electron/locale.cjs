/** 主进程文案：仅覆盖对话框、窗口标题和主进程错误。 */
const MESSAGES = {
  'zh-CN': {
    appTitle: '大肥鱼笔记本',
    untitled: '未命名文档',
    imageFilter: '图片',
    importFilter: '文本、Markdown 与 Word',
    pluginOutput: '插件输出',
    windowNotReady: '窗口未就绪',
    mcpNotReady: '日记尚未准备好',
    mcpTimeout: '日记命令超时',
    mcpFailed: 'MCP 命令失败',
    windowsOnly: '仅支持 Windows',
    invalidPluginId: '插件 id 不合法',
    invalidPath: '路径不合法',
    builtinPluginCannotDelete: '内置插件不能删除，可在用户插件目录中覆盖',
    insertImage: '插入图片',
    importText: '导入文本 / Markdown / Word',
    saveText: '保存文本',
    textFilter: '文本',
    openDocument: '打开文档',
    openInNewWindow: '在新窗口打开文档',
    saveAs: '保存为',
    dfyFilter: '大肥鱼笔记本文档',
    allFiles: '所有文件',
    exportWord: '导出 Word 文档',
    wordFilter: 'Word 文档',
    exportPdf: '导出 PDF',
    pdfFilter: 'PDF',
    unsavedTitle: '有未保存的修改',
    unsavedMessage: '这份文档还没有保存，确定要关闭吗？',
    unsavedDetail: '选择“取消”可以回到文档继续编辑。',
    cancel: '取消',
    discard: '不保存，直接关闭',
    unauthorizedPath: '未授权的文件路径',
  },
  en: {
    appTitle: 'Dafeiyu Notebook',
    untitled: 'Untitled',
    imageFilter: 'Images',
    importFilter: 'Text, Markdown and Word',
    pluginOutput: 'Plugin Output',
    windowNotReady: 'Window is not ready',
    mcpNotReady: 'The notebook is not ready',
    mcpTimeout: 'Notebook command timed out',
    mcpFailed: 'MCP command failed',
    windowsOnly: 'Windows only',
    invalidPluginId: 'Invalid plugin id',
    invalidPath: 'Invalid path',
    builtinPluginCannotDelete: 'Built-in plugins cannot be deleted; override them in the user plugin directory',
    insertImage: 'Insert Image',
    importText: 'Import Text / Markdown / Word',
    saveText: 'Save Text',
    textFilter: 'Text',
    openDocument: 'Open Document',
    openInNewWindow: 'Open Document in New Window',
    saveAs: 'Save As',
    dfyFilter: 'Dafeiyu Notebook Document',
    allFiles: 'All Files',
    exportWord: 'Export Word Document',
    wordFilter: 'Word Document',
    exportPdf: 'Export PDF',
    pdfFilter: 'PDF',
    unsavedTitle: 'Unsaved Changes',
    unsavedMessage: 'This document has not been saved. Close anyway?',
    unsavedDetail: 'Choose Cancel to return to the document.',
    cancel: 'Cancel',
    discard: 'Close Without Saving',
    unauthorizedPath: 'Unauthorized file path',
  },
};

let current = 'zh-CN';

function setMainLocale(locale) {
  current = locale === 'en' ? 'en' : 'zh-CN';
}

function mainT(key, params = {}) {
  const template = MESSAGES[current][key] ?? MESSAGES['zh-CN'][key] ?? key;
  return template.replace(/\{(\w+)\}/g, (match, name) => (
    params[name] === undefined ? match : String(params[name])
  ));
}

module.exports = { setMainLocale, mainT };
