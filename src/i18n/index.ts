/**
 * 轻量界面本地化：当前阶段覆盖静态外壳与 About。
 * 动态界面文案后续通过 t() 逐步接入，避免一次性改动所有模块。
 */
export type Locale = 'zh-CN' | 'en';

const STORAGE_KEY = 'dafeiyu.locale';
let beforeLocaleChange: (() => boolean) | null = null;

export function onBeforeLocaleChange(handler: () => boolean): void {
  beforeLocaleChange = handler;
}

const EN: Record<string, string> = {
  '语言': 'Language',
  'DSH 接入': 'DSH Integration',
  'MCP 地址': 'MCP Address',
  '—— 软件作者：续止': '— Author: 续止',
  '————  支持作者  ————': '————  Support the Author  ————',
  '一个本地优先的块式笔记与文档编辑器': 'A local-first block note and document editor',
  '主题': 'Theme',
  '灰白': 'Light Gray',
  '暖纸': 'Warm Paper',
  '雾青': 'Mist Teal',
  '夜间': 'Dark',
  '依 CC BY-NC-SA 4.0 授权，仅限非商业用途': 'Licensed under CC BY-NC-SA 4.0; non-commercial use only',
  '保存': 'Save',
  '保持日记运行，并启用服务。': 'Keep the notebook running and enable the service.',
  '停止服务': 'Stop Service',
  '关 于': 'About',
  '关于': 'About',
  '检查更新': 'Check for Updates',
  '关联 .dfy 文件': 'Associate .dfy files',
  '删除标记': 'Delete Mark',
  '删除注释': 'Delete Comment',
  '删除高亮': 'Delete Highlight',
  '取消': 'Cancel',
  '另存为…': 'Save As…',
  '启用服务': 'Enable Service',
  '图标': 'Icon',
  '在 DSH 中使用': 'Using with DSH',
  '在 DSH 对话框中说明编辑要求，由 DSH 完成。': 'Describe the edit request in the DSH conversation and let DSH complete it.',
  '在 DSH 插件管理中安装 dsh-notebook-mcp。': 'Install dsh-notebook-mcp in the DSH plugin manager.',
  '在文件夹中显示': 'Show in Folder',
  '在新窗口打开…': 'Open in New Window…',
  '均允许商业使用': 'are licensed for commercial use',
  '复制': 'Copy',
  '复制连接地址': 'Copy Connection Address',
  '外部 AI 写入通道': 'External AI write channel',
  '大肥鱼笔记本': 'Dafeiyu Notebook',
  '作者标识': 'Author mark',
  '作者专属标识仅用于官方发布，不包含在源代码仓库中，': 'Author-only marks are used only in official releases and are not included in the source repository.',
  '也不属于源代码的 MIT 许可范围。': 'They are not covered by the MIT License for the source code.',
  '如果这个软件您觉得很不错，可以通过官方安装包中的方式支持作者': 'If you find this software useful, you can support the author through the official installer.',
  '感谢支持': 'Thank you for your support.',
  '支持作者': 'Support the Author',
  '字': 'Font',
  '字体': 'Font',
  '字体库': 'Font Library',
  '导入 Word / Markdown / 文本…': 'Import Word / Markdown / Text…',
  '导出 PDF': 'Export PDF',
  '导出 Word': 'Export Word',
  '已保存': 'Saved',
  '未保存': 'Unsaved',
  '保存中…': 'Saving…',
  '无标题文档': 'Untitled',
  '块 {count} · 字数 {words} · 选中 {selected}': 'Blocks {count} · Words {words} · Selected {selected}',
  ' · 整组 {count} 块': ' · Group of {count}',
  '正文/注释按字数，表格按已填写单元格，图表按个': 'Text and comments count by characters; tables by filled cells; charts by item',
  '目录 {count}': 'Outline {count}',
  '把块加入目录后，会在这里出现。': 'Blocks added to the outline will appear here.',
  '＋ 拖到这里加到目录末尾': '＋ Drag here to add to the end of the outline',
  '展开': 'Expand',
  '折叠': 'Collapse',
  '拖动排序 / 调整层级': 'Drag to reorder / change level',
  '删除此目录': 'Delete this outline entry',
  '删除 {count} 个目录': 'Delete {count} outline entries',
  '主题：{name}': 'Theme: {name}',
  '当前文档还有未保存的修改，确定要丢弃吗？': 'This document has unsaved changes. Discard them?',
  '将 .dfy 文件默认用当前程序打开，并在右键新建中加入空白文档？': 'Open .dfy files with this app by default and add a blank document to the New menu?',
  '已设置 .dfy 文件关联和右键新建': '.dfy file association and New menu entry have been set',
  '设置文件关联失败：{error}': 'Failed to set file association: {error}',
  '文档还没有保存': 'This document has not been saved yet',
  '打开文档失败，文件可能已损坏或路径不可用': 'Could not open the document. The file may be damaged or unavailable.',
  '打开文档失败，文件可能已损坏': 'Could not open the document. The file may be damaged.',
  '保存失败：{error}': 'Save failed: {error}',
  '保存失败，文件未被修改': 'Save failed; the file was not changed',
  '导入失败，无法读取文件': 'Import failed; the file could not be read',
  '打印失败：{reason}': 'Print failed: {reason}',
  '还没有打开过文档。': 'No documents have been opened yet.',
  '未知错误': 'Unknown error',
  '未返回文件路径': 'No file path was returned',
  '读取剪贴板失败': 'Could not read the clipboard',
  '粘贴图片失败': 'Could not paste the image',
  '图片无法从剪贴板读取': 'Could not read the image from the clipboard',
  '已保留文本': 'Text preserved',
  '粘贴失败': 'Paste failed',
  '应用': 'Apply',
  '应用图标基于上善无形、ZipZipPipe 的原作修改': 'The app icon is based on original works by 上善无形 and ZipZipPipe',
  '所有功能免费使用': 'All features are free to use',
  '打印…': 'Print…',
  '打开文档…': 'Open Document…',
  '插件管理': 'Plugin Manager',
  '插入链接': 'Insert Link',
  '支持 TTF / OTF / WOFF；字体只保存在本机。': 'Supports TTF / OTF / WOFF. Fonts are stored locally only.',
  '文件': 'File',
  '文档默认保存在本机': 'Documents are stored locally by default',
  '新建文档': 'New Document',
  '新开一个 DSH 会话，可拖入目标 .dfy 文件。': 'Start a new DSH session and drag in the target .dfy file.',
  '显示': 'Show',
  '最近打开': 'Recent',
  '未启用': 'Disabled',
  '标记': 'Mark',
  '正在打开文档…': 'Opening document…',
  '波浪线': 'Wavy',
  '注释': 'Comment',
  '添加': 'Add',
  '添加图标': 'Add Icon',
  '添加字体…': 'Add Font…',
  '源代码以 MIT 许可证开源，完整文本见 LICENSE': 'Source code is open-sourced under the MIT License. See LICENSE for the full text.',
  '版权所有 © 2026 续止': 'Copyright © 2026 续止',
  '目录': 'Outline',
  '直线': 'Solid',
  '缩放': 'Zoom',
  '虚线': 'Dashed',
  '视图': 'View',
  '访问令牌': 'Access Token',
  '调色板': 'Palette',
  '软件内置思源黑体、霞鹜文楷、MiSans': 'Built-in fonts: Source Han Sans, LXGW WenKai, and MiSans',
  '连接信息': 'Connection Info',
  '退出': 'Quit',
  '页面尺寸': 'Page Size',
  '颜色': 'Color',
  '马克笔': 'Marker',
  '（字体许可证随字体文件附带）': '(Font licenses are included with the font files.)',
  '（自愿原则，金额随意，不影响任何功能使用）': '(Voluntary; any amount; no feature is affected.)',

  '图片处理失败': 'Image processing failed',
  '水平翻转': 'Flip Horizontal',
  '垂直翻转': 'Flip Vertical',
  '裁剪…': 'Crop…',
  '恢复宽度 100%': 'Reset Width to 100%',
  '替换图片': 'Replace Image',
  '删除图片': 'Delete Image',
  '在上方插入行': 'Insert Row Above',
  '在下方插入行': 'Insert Row Below',
  '在左侧插入列': 'Insert Column Left',
  '在右侧插入列': 'Insert Column Right',
  '删除当前行': 'Delete Current Row',
  '删除当前列': 'Delete Current Column',
  '合并选中单元格': 'Merge Selected Cells',
  '生成图表': 'Create Chart',
  '拆分单元格': 'Split Cell',
  '选择表格大小': 'Choose Table Size',
  '自定义': 'Custom',
  '行': 'Rows',
  '列': 'Columns',
  '插入': 'Insert',
  '柱状图': 'Bar Chart',
  '折线图': 'Line Chart',
  '饼图': 'Pie Chart',
  '系列 {count}': 'Series {count}',
  '编辑图表': 'Edit Chart',
  '图表标题': 'Chart title',
  '标题': 'Title',
  '类型': 'Type',
  '分类': 'Category',
  '系列名称': 'Series name',
  '数值': 'Value',
  '{name} 数值': '{name} value',
  '+ 分类': '+ Category',
  '+ 系列': '+ Series',
  '刷新图表': 'Refresh Chart',
  '表格至少需要两行两列': 'A table needs at least two rows and two columns',
  '自定义字体': 'Custom font',
  '思源黑体': 'Source Han Sans',
  '霞鹜文楷': 'LXGW WenKai',
  'Aa 字体预览': 'Aa Font Preview',
  '字体预览': 'Font preview',
  '拖动排序': 'Drag to reorder',
  '删除字体': 'Delete Font',
  '默认': 'Default',
  '默认字体不可删除': 'Built-in fonts cannot be deleted',
  '已添加字体：{name}': 'Font added: {name}',
  '字体加载失败，请确认文件是有效的 TTF/OTF/WOFF': 'Could not load the font. Make sure it is a valid TTF/OTF/WOFF file.',
  '（没有说明）': '(No description)',
  '加载失败：{error}': 'Load failed: {error}',
  '插件目录读取失败：{error}': 'Could not read the plugin directory: {error}',
  '当前插件已全部隐藏。点「显示隐藏」恢复。': 'All plugins are hidden. Click "Show Hidden" to restore them.',
  '插件目录里还没有插件。点「打开目录」放进去后再重新加载。': 'No plugins yet. Click "Open Folder", add them, then reload.',
  '插件（{count}）': 'Plugins ({count})',
  '显示隐藏（{count}）': 'Show Hidden ({count})',
  '打开目录': 'Open Folder',
  '重新加载': 'Reload',
  '隐藏内置插件': 'Hide Built-in Plugin',
  '删除插件': 'Delete Plugin',
  '搜索正文与注释…': 'Search text and comments…',
  '输入关键词开始搜索。': 'Enter a keyword to start searching.',
  '没有找到相关内容。': 'No matching content found.',
  '共 {count} 条': '{count} results',
  '表格': 'Table',
  '图表': 'Chart',
  '选择颜色': 'Choose Color',
  '确定': 'OK',
  '添加到色板': 'Add to Swatches',
  '已添加': 'Added',
  '已在色板': 'Already in Swatches',
  '剪切': 'Cut',
  '粘贴': 'Paste',
  '只粘贴文本': 'Paste as Plain Text',
  '清空内容': 'Clear Content',
  '删除区块': 'Delete Block',
  '组注释': 'Group comment',
  '注释图片': 'Comment image',
  '拖动调整图片宽度': 'Drag to resize image',
  '输入组注释…': 'Enter a group comment…',
  '输入注释…': 'Enter a comment…',
  '插入内容': 'Insert Content',
  '运行中 · 127.0.0.1:{port}': 'Running · 127.0.0.1:{port}',
  '启动失败{error}': 'Start failed{error}',
  '已启用，服务未运行': 'Enabled, service not running',
  '复制失败': 'Copy failed',
  '隐藏': 'Hide',
  '连接地址已复制': 'Connection address copied',
  '访问令牌已复制': 'Access token copied',
  '星': 'Star',
  '已掌握': 'Mastered',
  '重要': 'Important',
  '疑问': 'Question',
  '圆点': 'Dot',
  '参考': 'Reference',
  '方块': 'Square',
  '目标': 'Target',
  '空心': 'Hollow',
  '太阳': 'Sun',
  '爱心': 'Heart',
  '花朵': 'Flower',
  '王冠': 'Crown',
  '黑桃': 'Spade',
  '方框': 'Box',
  '自定义图标': 'Custom icon',
  '当前图标': 'Current icon',
  '自定义图标已达上限（{count} 个），请先删除一个': 'Custom icon limit ({count}) reached. Delete one first.',
  '星标不可删除': 'The star icon cannot be deleted',
  '删除': 'Delete',
  '{label}（可拖动排序）': '{label} (drag to reorder)',
  '下划线': 'Underline',
  '两端对齐': 'Justify',
  '关闭': 'Close',
  '关闭关于': 'Close About',
  '删除线': 'Strikethrough',
  '加粗': 'Bold',
  '右对齐': 'Align Right',
  '大肥鱼笔记本应用图标': 'Dafeiyu Notebook app icon',
  '字号': 'Font Size',
  '居中': 'Center',
  '左对齐': 'Align Left',
  '插入图片': 'Insert Image',
  '插入图表': 'Insert Chart',
  '插入表格': 'Insert Table',
  '搜索': 'Search',
  '撤销': 'Undo',
  '文字色': 'Text Color',
  '文字颜色': 'Text Color',
  '文字颜色样式': 'Text color style',
  '斜体': 'Italic',
  '新增块': 'Add Block',
  '更多': 'More',
  '最大化': 'Maximize',
  '最小化': 'Minimize',
  '标记图标': 'Mark icon',
  '标记样式': 'Mark style',
  '框选高亮': 'Selection highlight',
  '注释样式': 'Comment style',
  '目录显隐': 'Toggle outline',
  '纸张色': 'Paper color',
  '背景色': 'Background color',
  '色号': 'Hex color',
  '调整目录宽度': 'Resize outline',
  '输入或粘贴一个图标': 'Enter or paste an icon',
  '选择字号': 'Select font size',
  '重做': 'Redo',
  '链接': 'Link',
  '高亮': 'Highlight',
  '高亮样式': 'Highlight style',
  '高亮颜色': 'Highlight color',
  '大肥鱼笔记': 'Dafeiyu Notebook',
};

const normalized = (value: string): string => value.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
const EN_BY_KEY = new Map(Object.entries(EN).map(([key, value]) => [normalized(key), value]));

export function getLocale(): Locale {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'en' || saved === 'zh-CN') return saved;
  } catch {
    /* 存储不可用时按系统语言判断 */
  }
  return navigator.language.toLowerCase().startsWith('zh') ? 'zh-CN' : 'en';
}

export function setLocale(locale: Locale): boolean {
  if (beforeLocaleChange && !beforeLocaleChange()) return false;
  try {
    localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    /* 存储不可用时仍允许本次切换 */
  }
  window.location.reload();
  return true;
}

export function t(source: string, params: Record<string, string | number> = {}): string {
  const template = getLocale() === 'en' ? (EN_BY_KEY.get(normalized(source)) ?? source) : source;
  return template.replace(/\{(\w+)\}/g, (match, key: string) => {
    const value = params[key];
    return value === undefined ? match : String(value);
  });
}

function translateNode(node: Node): void {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = node as Text;
    const raw = text.data;
    const translated = EN_BY_KEY.get(normalized(raw));
    if (!translated) return;
    const leading = raw.match(/^\s*/)?.[0] ?? '';
    const trailing = raw.match(/\s*$/)?.[0] ?? '';
    text.data = `${leading}${translated}${trailing}`;
    return;
  }
  if (!(node instanceof Element)) return;
  for (const attribute of ['title', 'aria-label', 'placeholder', 'alt']) {
    const value = node.getAttribute(attribute);
    if (!value) continue;
    const translated = EN_BY_KEY.get(normalized(value));
    if (translated) node.setAttribute(attribute, translated);
  }
}

function translateTree(root: Element): void {
  const skip = 'script, style, noscript, .block-content, .doc-table, [contenteditable="true"], .comment-line-text';
  for (const child of root.childNodes) {
    if (child instanceof Element && child.matches(skip)) continue;
    translateNode(child);
    if (child instanceof Element) translateTree(child);
    else if (child.nodeType === Node.TEXT_NODE) continue;
  }
}

export function installI18n(): void {
  window.addEventListener('storage', (event) => {
    if (event.key === STORAGE_KEY && event.newValue) window.location.reload();
  });
  const locale = getLocale();
  window.moye?.setLocale?.(locale);
  document.documentElement.lang = locale;
  if (locale === 'en') {
    translateTree(document.body);
    const title = EN_BY_KEY.get(normalized(document.title));
    if (title) document.title = title;
    else document.title = document.title.replace(/^大肥鱼笔记本/, 'Dafeiyu Notebook');
  }
  const select = document.querySelector<HTMLSelectElement>('#language-select');
  if (!select) return;
  select.value = locale;
  select.addEventListener('change', () => {
    if (!setLocale(select.value === 'en' ? 'en' : 'zh-CN')) select.value = locale;
  });
}
