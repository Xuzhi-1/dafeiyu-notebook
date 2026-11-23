/**
 * Electron 主进程（重写版）：窗口 + 文件读写 + 导出 + 打开参数。
 */
const { app, BrowserWindow, ipcMain, dialog, protocol, net, shell, Menu, clipboard, ClipboardItem, nativeImage } = require('electron');
const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const crypto = require('node:crypto');
const { pathToFileURL } = require('node:url');
const HTMLtoDOCX = require('html-to-docx');
const { createMcpServer } = require('./mcp-server.cjs');
const { setMainLocale, mainT } = require('./locale.cjs');
const execFileAsync = promisify(execFile);

const APP_ICON = path.join(__dirname, '..', 'app.ico');
app.setAppUserModelId('Dafeiyu.Notebook');

protocol.registerSchemesAsPrivileged([
  { scheme: 'moye-plugin', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } },
]);

const testUserData = process.env.DAFEIYU_USER_DATA ? path.resolve(process.env.DAFEIYU_USER_DATA) : '';
if (testUserData) {
  // 目录通常已由启动脚本或用户创建；沙箱环境下 mkdir 可能被拒绝，但不影响 setPath
  try {
    require('node:fs').mkdirSync(testUserData, { recursive: true });
  } catch {
    /* ignore */
  }
  try {
    app.setPath('userData', testUserData);
  } catch (error) {
    console.error(error);
  }
}

app.disableHardwareAcceleration();

const PAGE_TWIPS = {
  A3: { width: 16838, height: 23811 },
  A4: { width: 11906, height: 16838 },
  A5: { width: 8391, height: 11906 },
  B5: { width: 9979, height: 14173 },
  Letter: { width: 12240, height: 15840 },
};
const VALID_PAGE_SIZES = new Set(Object.keys(PAGE_TWIPS));
const allowedPaths = new Set();

function canonicalPath(filePath) {
  const value = String(filePath || '').trim();
  return value ? path.resolve(value) : '';
}

function authorizePath(filePath) {
  const value = canonicalPath(filePath);
  if (value) allowedPaths.add(value);
  return value;
}

function isKnownPath(filePath) {
  const value = canonicalPath(filePath);
  if (!value) return false;
  if (allowedPaths.has(value)) return true;
  return readRecent().some((item) => canonicalPath(item.path) === value);
}

async function writeAtomic(filePath, data) {
  const target = canonicalPath(filePath);
  if (!target) throw new Error('invalid path');
  const temp = `${target}.${process.pid}.${Date.now()}.tmp`;
  try {
    await fs.writeFile(temp, data);
    await fs.rename(temp, target);
  } finally {
    await fs.rm(temp, { force: true }).catch(() => {});
  }
}

let win = null;
let saveStateTimer = 0;
const windowStates = new Map();

function windowStateOf(contents) {
  let value = windowStates.get(contents.id);
  if (!value) {
    value = { ready: false, pendingPath: null, dirty: false, forceClose: false };
    windowStates.set(contents.id, value);
  }
  return value;
}

function windowFromEvent(event) {
  return BrowserWindow.fromWebContents(event.sender) ?? win;
}
const MCP_PORT = 41337;
let mcpServer = null;
const mcpPending = new Map();
let mcpSeq = 0;

function mcpFilePath(name) {
  return path.join(app.getPath('userData'), name);
}

function mcpToken() {
  const file = mcpFilePath('mcp-token.txt');
  try {
    const value = fsSync.readFileSync(file, 'utf8').trim();
    if (/^[a-f0-9]{48}$/.test(value)) return value;
  } catch {
    /* 首次启动时生成 */
  }
  const value = crypto.randomBytes(24).toString('hex');
  try {
    fsSync.mkdirSync(path.dirname(file), { recursive: true });
    fsSync.writeFileSync(file, value, 'utf8');
  } catch {
    /* token 仍可在本次运行使用 */
  }
  return value;
}

function mcpEnabled() {
  try {
    return Boolean(JSON.parse(fsSync.readFileSync(mcpFilePath('mcp-enabled.json'), 'utf8'))?.enabled);
  } catch {
    return false;
  }
}

function setMcpEnabled(value) {
  try {
    fsSync.mkdirSync(app.getPath('userData'), { recursive: true });
    fsSync.writeFileSync(mcpFilePath('mcp-enabled.json'), JSON.stringify({ enabled: value }), 'utf8');
  } catch {
    /* ignore */
  }
}

function mcpStatus() {
  const token = mcpToken();
  return {
    enabled: mcpEnabled(),
    running: Boolean(mcpServer?.running),
    port: MCP_PORT,
    url: `http://127.0.0.1:${MCP_PORT}/mcp?token=${token}`,
    token,
  };
}

function executeRendererCommand(name, args) {
  return new Promise((resolve, reject) => {
    if (!win || !windowStateOf(win.webContents).ready || win.isDestroyed()) {
      reject(new Error(mainT('mcpNotReady')));
      return;
    }
    const id = `mcp_${++mcpSeq}`;
    const timer = setTimeout(() => {
      mcpPending.delete(id);
      reject(new Error(mainT('mcpTimeout')));
    }, 15000);
    mcpPending.set(id, { resolve, reject, timer });
    win.webContents.send('mcp:command', { id, name, args });
  });
}

ipcMain.on('mcp:result', (_event, payload) => {
  const pending = mcpPending.get(String(payload?.id || ''));
  if (!pending) return;
  clearTimeout(pending.timer);
  mcpPending.delete(String(payload.id));
  if (payload?.ok) pending.resolve(payload.result);
  else pending.reject(new Error(String(payload?.error || mainT('mcpFailed'))));
});

ipcMain.on('win:minimize', (event) => windowFromEvent(event)?.minimize());

ipcMain.on('win:maximize', (event) => {
  const target = windowFromEvent(event);
  if (!target) return;
  if (target.isMaximized()) target.unmaximize();
  else target.maximize();
});

ipcMain.on('win:close', (event) => windowFromEvent(event)?.close());

ipcMain.handle('win:state', (event) => ({ maximized: Boolean(windowFromEvent(event)?.isMaximized()) }));

/* ------------------------------------------------------------ 最近文件 / 导入 / 打印 */

function recentPath() {
  return path.join(app.getPath('userData'), 'recent.json');
}

function readRecent() {
  try {
    const list = JSON.parse(fsSync.readFileSync(recentPath(), 'utf8'));
    return Array.isArray(list) ? list.slice(0, 6) : [];
  } catch {
    return [];
  }
}

function writeRecent(list) {
  try {
    fsSync.mkdirSync(path.dirname(recentPath()), { recursive: true });
    fsSync.writeFileSync(recentPath(), JSON.stringify(list.slice(0, 6), null, 2), 'utf8');
  } catch (error) {
    console.error(error);
  }
}

function dialogSettingsPath() {
  return path.join(app.getPath('userData'), 'dialog-settings.json');
}

function lastSaveDirectory() {
  try {
    const value = JSON.parse(fsSync.readFileSync(dialogSettingsPath(), 'utf8'));
    const dir = typeof value?.saveDir === 'string' ? value.saveDir : '';
    if (dir && fsSync.statSync(dir).isDirectory()) return dir;
  } catch {
    /* 目录不存在或设置损坏时回退到文档目录 */
  }
  return app.getPath('documents');
}

function rememberSaveDirectory(filePath) {
  try {
    const dir = path.dirname(filePath);
    if (!fsSync.statSync(dir).isDirectory()) return;
    fsSync.mkdirSync(path.dirname(dialogSettingsPath()), { recursive: true });
    fsSync.writeFileSync(dialogSettingsPath(), JSON.stringify({ saveDir: dir }, null, 2), 'utf8');
  } catch {
    /* 记住目录失败不影响保存 */
  }
}

ipcMain.handle('recent:list', () => readRecent());

ipcMain.handle('recent:add', (_event, payload) => {
  const filePath = String(payload?.path || '');
  if (!filePath) return readRecent();
  if (!isKnownPath(filePath)) return readRecent();
  const list = readRecent().filter((item) => item.path !== filePath);
  list.unshift({ path: filePath, title: String(payload?.title || '').slice(0, 80), at: Date.now() });
  const next = list.slice(0, 6);
  writeRecent(next);
  return next;
});

ipcMain.handle('clipboard:write-blocks', async (_event, payload) => {
  try {
    const text = typeof payload?.text === 'string' ? payload.text : '';
    const html = typeof payload?.html === 'string' ? payload.html : '';
    if (!text || !html || text.length > 32 * 1024 * 1024 || html.length > 32 * 1024 * 1024) return false;
    await clipboard.write([new ClipboardItem({ 'text/plain': text, 'text/html': html })]);
    return true;
  } catch {
    return false;
  }
});

ipcMain.handle('clipboard:snapshot', () => {
  try {
    const image = clipboard.readImage();
    return {
      text: clipboard.readText(),
      html: clipboard.readHTML(),
      image: image.isEmpty() ? '' : image.toDataURL(),
    };
  } catch {
    return null;
  }
});

ipcMain.handle('clipboard:restore', (_event, snapshot) => {
  try {
    const text = typeof snapshot?.text === 'string' ? snapshot.text.slice(0, 32 * 1024 * 1024) : '';
    const html = typeof snapshot?.html === 'string' ? snapshot.html.slice(0, 32 * 1024 * 1024) : '';
    const dataUrl = typeof snapshot?.image === 'string' ? snapshot.image : '';
    const image = dataUrl.startsWith('data:image/') && dataUrl.length <= 32 * 1024 * 1024
      ? nativeImage.createFromDataURL(dataUrl)
      : null;
    clipboard.clear();
    if (image && !image.isEmpty()) clipboard.write({ text, html, image });
    else if (html) clipboard.write({ text, html });
    else clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
});

ipcMain.handle('clipboard:read-html', async () => {
  try {
    const items = await clipboard.read();
    for (const item of items) {
      if (!item.types.includes('text/html')) continue;
      const value = await item.getType('text/html');
      return typeof value === 'string' ? value : await value.text();
    }
  } catch {
    /* 剪贴板不包含 HTML */
  }
  return '';
});

ipcMain.handle('clipboard:read-text', () => {
  try {
    return clipboard.readText();
  } catch {
    return '';
  }
});

ipcMain.handle('image:clipboard', () => {
  const image = clipboard.readImage();
  if (!image || image.isEmpty()) return null;
  let current = image;
  const maxEdge = 2400;
  const maxBytes = 8 * 1024 * 1024;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const size = current.getSize();
    const edge = Math.max(size.width, size.height);
    const dataUrl = current.toDataURL();
    if (edge <= maxEdge && dataUrl.length <= maxBytes) {
      return { dataUrl, width: size.width, height: size.height };
    }
    const scale = Math.min(maxEdge / Math.max(1, edge), 0.85);
    current = current.resize({
      width: Math.max(1, Math.round(size.width * scale)),
      height: Math.max(1, Math.round(size.height * scale)),
      quality: 'good',
    });
  }
  const size = current.getSize();
  return { dataUrl: current.toDataURL(), width: size.width, height: size.height };
});

ipcMain.handle('image:pick', async () => {
  const forced = process.env.DAFEIYU_TEST_IMAGE;
  let filePath = forced;
  if (!filePath) {
    const result = await dialog.showOpenDialog(win, {
      title: mainT('insertImage'),
      defaultPath: lastSaveDirectory(),
      properties: ['openFile'],
      filters: [{ name: mainT('imageFilter'), extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'] }],
    });
    if (result.canceled || !result.filePaths.length) return null;
    filePath = result.filePaths[0];
  }
  authorizePath(filePath);
  const buffer = await fs.readFile(filePath);
  const ext = path.extname(filePath).slice(1).toLowerCase();
  const mime = ext === 'jpg' ? 'jpeg' : ext;
  return {
    path: filePath,
    name: path.basename(filePath),
    dataUrl: `data:image/${mime};base64,${buffer.toString('base64')}`,
  };
});

ipcMain.handle('file:import', async () => {
  const forced = process.env.DAFEIYU_TEST_IMPORT;
  let filePath = forced;
  if (!filePath) {
    const result = await dialog.showOpenDialog(win, {
      title: mainT('importText'),
      defaultPath: lastSaveDirectory(),
      properties: ['openFile'],
      filters: [
        { name: mainT('importFilter'), extensions: ['txt', 'md', 'markdown', 'docx'] },
        { name: mainT('allFiles'), extensions: ['*'] },
      ],
    });
    if (result.canceled || !result.filePaths.length) return null;
    filePath = result.filePaths[0];
  }
  authorizePath(filePath);
  const name = path.basename(filePath, path.extname(filePath));
  if (/\.docx$/i.test(filePath)) {
    const mammoth = require('mammoth');
    const result = await mammoth.convertToHtml({ path: filePath });
    return { path: filePath, name, kind: 'docx', html: result.value };
  }
  const content = await fs.readFile(filePath, 'utf8');
  return { path: filePath, name, kind: 'text', content };
});

ipcMain.handle('shell:open-external', async (_event, url) => {
  const value = String(url || '');
  if (!/^https?:\/\//i.test(value)) return false;
  await shell.openExternal(value);
  return true;
});

ipcMain.handle('shell:show-item', (_event, filePath) => {
  const target = canonicalPath(filePath);
  if (!target || !isKnownPath(target)) return false;
  shell.showItemInFolder(target);
  return true;
});

ipcMain.handle('doc:print', async () => {
  if (!win) return { ok: false, reason: mainT('windowNotReady') };
  return new Promise((resolve) => {
    win.webContents.print({ silent: false, printBackground: true }, (ok, reason) => resolve({ ok, reason }));
  });
});

ipcMain.handle('file:save-text', async (_event, { name, content }) => {
  const forced = process.env.DAFEIYU_TEST_SAVE_TEXT;
  let filePath = forced;
  if (!filePath) {
    const result = await dialog.showSaveDialog(win, {
      title: mainT('saveText'),
      defaultPath: path.join(lastSaveDirectory(), `${sanitizeName(name || mainT('pluginOutput'))}.txt`),
      filters: [{ name: mainT('textFilter'), extensions: ['txt', 'md', 'json'] }],
    });
    if (result.canceled || !result.filePath) return { canceled: true };
    filePath = result.filePath;
  }
  authorizePath(filePath);
  await writeAtomic(filePath, String(content ?? ''));
  rememberSaveDirectory(filePath);
  return { path: filePath };
});

/* ------------------------------------------------------------ 窗口状态 */

function windowStatePath() {
  return path.join(app.getPath('userData'), 'window-state.json');
}

function normalizeDocPath(filePath) {
  const value = canonicalPath(filePath);
  return value ? value.toLowerCase() : '';
}

function readWindowState() {
  try {
    const raw = JSON.parse(fsSync.readFileSync(windowStatePath(), 'utf8'));
    const legacy = raw && raw.bounds ? raw : null;
    const last = raw?.last ?? legacy;
    const documents = raw && raw.documents && typeof raw.documents === 'object' ? raw.documents : {};
    return { last, documents };
  } catch {
    return { last: null, documents: {} };
  }
}

function windowStateEntry(raw) {
  const bounds = raw?.bounds ?? raw;
  if (!bounds || !Number.isFinite(bounds.width) || !Number.isFinite(bounds.height)) return null;
  return {
    width: Math.max(900, Math.round(bounds.width)),
    height: Math.max(600, Math.round(bounds.height)),
    x: Number.isFinite(bounds.x) ? Math.round(bounds.x) : undefined,
    y: Number.isFinite(bounds.y) ? Math.round(bounds.y) : undefined,
    maximized: Boolean(raw?.maximized),
  };
}

function loadWindowState(filePath) {
  const state = readWindowState();
  const key = normalizeDocPath(filePath);
  const documentState = key ? windowStateEntry(state.documents[key]) : null;
  if (documentState) return { ...documentState, source: 'document' };
  const last = windowStateEntry(state.last);
  return last ? { ...last, source: 'last' } : null;
}

/** 换屏后旧坐标可能完全在屏幕外：至少要有足够面积落在某个显示器里（R15） */
function isVisibleOnSomeScreen(bounds) {
  try {
    const { screen } = require('electron');
    return screen.getAllDisplays().some((display) => {
      const area = display.workArea;
      const overlapX = Math.min(bounds.x + bounds.width, area.x + area.width) - Math.max(bounds.x, area.x);
      const overlapY = Math.min(bounds.y + bounds.height, area.y + area.height) - Math.max(bounds.y, area.y);
      return overlapX > 120 && overlapY > 80;
    });
  } catch {
    return true;
  }
}

function saveWindowState(target = win) {
  if (!target || target.isDestroyed()) return;
  try {
    const bounds = target.getNormalBounds ? target.getNormalBounds() : target.getBounds();
    const state = readWindowState();
    const entry = { bounds, maximized: target.isMaximized(), updatedAt: Date.now() };
    state.last = entry;
    const key = normalizeDocPath(windowStateOf(target.webContents).path);
    if (key) state.documents[key] = entry;
    const keys = Object.keys(state.documents);
    if (keys.length > 80) {
      keys.sort((a, b) => (state.documents[b]?.updatedAt ?? 0) - (state.documents[a]?.updatedAt ?? 0));
      for (const old of keys.slice(80)) delete state.documents[old];
    }
    fsSync.mkdirSync(path.dirname(windowStatePath()), { recursive: true });
    fsSync.writeFileSync(windowStatePath(), JSON.stringify({ version: 1, last: state.last, documents: state.documents }, null, 2), 'utf8');
  } catch (error) {
    console.error(error);
  }
}
function sanitizeName(name) {
  return String(name || mainT('untitled')).replace(/[\\/:*?"<>|]+/g, ' ').trim().slice(0, 90) || mainT('untitled');
}

async function readDocFile(filePath) {
  const raw = await fs.readFile(filePath, 'utf8');
  return { path: filePath, data: JSON.parse(raw) };
}

function queueOpenPath(filePath) {
  const value = authorizePath(filePath);
  if (value) createWindow(value);
}

function createWindow(initialPath = null) {
  const saved = loadWindowState(initialPath);
  const others = BrowserWindow.getAllWindows().filter((item) => !item.isDestroyed());
  const useSaved = saved
    && isVisibleOnSomeScreen({ x: saved.x ?? 60, y: saved.y ?? 40, width: saved.width, height: saved.height });
  const offset = others.length ? 28 * others.length : 0;
  const base = others[others.length - 1]?.getBounds();
  const documentState = useSaved && saved.source === 'document';
  const collision = documentState && others.some((item) => {
    const bounds = item.getBounds();
    return Math.abs(bounds.x - (saved.x ?? 0)) < 24 && Math.abs(bounds.y - (saved.y ?? 0)) < 24;
  });
  const window = new BrowserWindow({
    width: saved?.width ?? 1280,
    height: saved?.height ?? 860,
    x: useSaved && documentState && !collision ? saved.x : base ? base.x + offset : useSaved ? saved.x : undefined,
    y: useSaved && documentState && !collision ? saved.y : base ? base.y + offset : useSaved ? saved.y : undefined,
    minWidth: 900,
    minHeight: 600,
    show: false,
    frame: false,
    backgroundColor: '#f2f2f0',
    icon: fsSync.existsSync(APP_ICON) ? APP_ICON : undefined,
    title: mainT('appTitle'),
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  win = window;
  const contentsId = window.webContents.id;
  const state = windowStateOf(window.webContents);
  state.path = initialPath ? normalizeDocPath(initialPath) : null;
  state.pendingPath = initialPath ? authorizePath(initialPath) : null;
  if (useSaved && (documentState || !others.length) && saved.maximized) window.maximize();
  const appPage = pathToFileURL(path.join(__dirname, '..', 'dist', 'renderer', 'index.html')).toString();
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  window.webContents.on('will-navigate', (event, url) => {
    if (url === appPage || url.startsWith(`${appPage}#`)) return;
    event.preventDefault();
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url);
  });
  window.loadFile(path.join(__dirname, '..', 'dist', 'renderer', 'index.html'));
  window.once('ready-to-show', () => window.show());
  window.on('focus', () => { win = window; });
  const scheduleSave = () => {
    clearTimeout(saveStateTimer);
    saveStateTimer = setTimeout(() => saveWindowState(window), 400);
  };
  window.on('resize', scheduleSave);
  window.on('move', scheduleSave);
  window.on('close', async (event) => {
    saveWindowState(window);
    if (!state.dirty || state.forceClose) return;
    event.preventDefault();
    const { response } = await dialog.showMessageBox(window, {
      type: 'warning',
      buttons: [mainT('cancel'), mainT('discard')],
      defaultId: 0,
      cancelId: 0,
      title: mainT('unsavedTitle'),
      message: mainT('unsavedMessage'),
      detail: mainT('unsavedDetail'),
    });
    if (response === 1) {
      state.forceClose = true;
      window.close();
    }
  });
  window.on('closed', () => {
    windowStates.delete(contentsId);
    if (win === window) {
      win = BrowserWindow.getAllWindows().find((item) => !item.isDestroyed()) ?? null;
    }
  });
  window.on('maximize', () => window.webContents.send('win:maximized', true));
  window.on('unmaximize', () => window.webContents.send('win:maximized', false));
}

/* ------------------------------------------------------------ IPC */

ipcMain.handle('file:open', async () => {
  const test = process.env.DAFEIYU_TEST_OPEN;
  if (test) return readDocFile(authorizePath(test));
  const result = await dialog.showOpenDialog(win, {
    title: mainT('openDocument'),
    defaultPath: lastSaveDirectory(),
    properties: ['openFile'],
    filters: [{ name: mainT('dfyFilter'), extensions: ['dfy'] }, { name: mainT('allFiles'), extensions: ['*'] }],
  });
  if (result.canceled || !result.filePaths.length) return null;
  return readDocFile(authorizePath(result.filePaths[0]));
});

ipcMain.handle('file:open-new-window', async (event, filePath) => {
  let value = typeof filePath === 'string' ? authorizePath(filePath) : '';
  if (!value) {
    const result = await dialog.showOpenDialog(windowFromEvent(event), {
      title: mainT('openInNewWindow'),
      defaultPath: lastSaveDirectory(),
      properties: ['openFile'],
      filters: [{ name: mainT('dfyFilter'), extensions: ['dfy'] }, { name: mainT('allFiles'), extensions: ['*'] }],
    });
    if (result.canceled || !result.filePaths.length) return false;
    value = authorizePath(result.filePaths[0]);
  }
  if (!value) return false;
  createWindow(value);
  return true;
});

ipcMain.handle('file:read', async (_event, filePath) => {
  if (!isKnownPath(filePath)) throw new Error(mainT('unauthorizedPath'));
  authorizePath(filePath);
  return readDocFile(filePath);
});

ipcMain.handle('file:save', async (_event, { filePath, data }) => {
  if (!isKnownPath(filePath)) throw new Error(mainT('unauthorizedPath'));
  authorizePath(filePath);
  await writeAtomic(filePath, JSON.stringify(data, null, 2));
  rememberSaveDirectory(filePath);
  return { path: filePath };
});

ipcMain.handle('file:save-as', async (_event, { data, defaultName }) => {
  const forced = process.env.DAFEIYU_TEST_SAVE;
  let filePath = forced;
  if (!filePath) {
    const result = await dialog.showSaveDialog(win, {
      title: mainT('saveAs'),
      defaultPath: path.join(lastSaveDirectory(), `${sanitizeName(defaultName)}.dfy`),
      filters: [{ name: mainT('dfyFilter'), extensions: ['dfy'] }],
    });
    if (result.canceled || !result.filePath) return { canceled: true };
    filePath = result.filePath;
  }
  authorizePath(filePath);
  await writeAtomic(filePath, JSON.stringify(data, null, 2));
  rememberSaveDirectory(filePath);
  return { path: filePath };
});

ipcMain.handle('file:export-docx', async (_event, { html, defaultName, pageSize }) => {
  try {
    const size = VALID_PAGE_SIZES.has(pageSize) ? pageSize : 'A4';
    const forced = process.env.DAFEIYU_TEST_DOCX;
    let filePath = forced;
    if (!filePath) {
      const result = await dialog.showSaveDialog(win, {
        title: mainT('exportWord'),
        defaultPath: path.join(lastSaveDirectory(), `${sanitizeName(defaultName)}.docx`),
        filters: [{ name: mainT('wordFilter'), extensions: ['docx'] }],
      });
      if (result.canceled || !result.filePath) return { canceled: true };
      filePath = result.filePath;
    }
    const buffer = await HTMLtoDOCX(html, null, {
      orientation: 'portrait',
      // 缺任何一项都会被写成 "undefined"，Word 会判定文件损坏（旧版踩过的坑）
      margins: { top: 1440, right: 1440, bottom: 1440, left: 1440, header: 720, footer: 720, gutter: 0 },
      font: 'Microsoft YaHei',
      fontSize: 22,
      pageSize: PAGE_TWIPS[size],
    });
    authorizePath(filePath);
    await writeAtomic(filePath, buffer);
    rememberSaveDirectory(filePath);
    return { path: filePath };
  } catch (error) {
    return { error: error.message || String(error) };
  }
});

ipcMain.handle('file:export-pdf', async (_event, { defaultName, pageSize }) => {
  try {
    const forced = process.env.DAFEIYU_TEST_PDF;
    let filePath = forced;
    if (!filePath) {
      const result = await dialog.showSaveDialog(win, {
        title: mainT('exportPdf'),
        defaultPath: path.join(lastSaveDirectory(), `${sanitizeName(defaultName)}.pdf`),
        filters: [{ name: mainT('pdfFilter'), extensions: ['pdf'] }],
      });
      if (result.canceled || !result.filePath) return { canceled: true };
      filePath = result.filePath;
    }
    const pdf = await win.webContents.printToPDF({ printBackground: true, pageSize: VALID_PAGE_SIZES.has(pageSize) ? pageSize : 'A4' });
    authorizePath(filePath);
    await writeAtomic(filePath, pdf);
    rememberSaveDirectory(filePath);
    return { path: filePath };
  } catch (error) {
    return { error: error.message || String(error) };
  }
});

/* ------------------------------------------------------------ plugins */

/**
 * 插件目录：用户目录优先，其次是随应用内置的示例目录。
 * 只读沙箱里也可能无法创建用户目录，因此内置目录必须可用。
 */
function pluginRoots() {
  return [
    path.join(app.getPath('userData'), 'plugins'),
    path.join(app.getAppPath(), 'plugins'),
  ];
}

function ensurePlugins() {
  const dir = pluginRoots()[0];
  try {
    fsSync.mkdirSync(dir, { recursive: true });
  } catch {
    /* 目录可能已存在或不允许创建，跳过 */
  }
  return dir;
}

function readManifest(dir, folder) {
  try {
    const data = JSON.parse(fsSync.readFileSync(path.join(dir, folder, 'plugin.json'), 'utf8'));
    const id = String(data.id || folder).trim();
    const main = String(data.main || 'main.js').trim();
    if (!id || id === '.' || id === '..' || /[\\/\0]/.test(id)) return null;
    if (!main || path.isAbsolute(main) || main.includes('\0')) return null;
    if (main.split(/[\\/]/).some((part) => part === '..' || !part)) return null;
    return {
      id,
      name: String(data.name || folder),
      version: String(data.version || '0.0.0'),
      description: String(data.description || ''),
      main,
      source: dir === pluginRoots()[0] ? 'user' : 'builtin',
    };
  } catch {
    return null;
  }
}

function registerPluginProtocol() {
  protocol.handle('moye-plugin', async (request) => {
    try {
      const url = new URL(request.url);
      const id = decodeURIComponent(url.hostname);
      const relative = decodeURIComponent(url.pathname.replace(/^\/+/, ''));
      for (const base of pluginRoots()) {
        const root = path.resolve(base);
        const target = path.resolve(root, id, relative);
        if (!target.startsWith(root + path.sep)) continue;
        if (fsSync.existsSync(target)) return net.fetch(pathToFileURL(target).toString());
      }
      return new Response('not found', { status: 404 });
    } catch (error) {
      return new Response(String(error?.message ?? error), { status: 500 });
    }
  });
}

ipcMain.on('doc:path', (event, value) => {
  const target = windowFromEvent(event);
  if (!target) return;
  saveWindowState(target);
  windowStateOf(target.webContents).path = typeof value === 'string' && value ? normalizeDocPath(value) : null;
});

ipcMain.on('doc:dirty', (event, value) => {
  windowStateOf(event.sender).dirty = Boolean(value);
});

ipcMain.handle('app:info', (event) => {
  const target = windowFromEvent(event);
  return {
    version: app.getVersion(),
    userData: app.getPath('userData'),
    envUserData: process.env.DAFEIYU_USER_DATA || null,
    argv: process.argv,
    pluginRoots: pluginRoots(),
    bounds: target ? target.getBounds() : null,
    maximized: target ? target.isMaximized() : false,
    dirty: windowStateOf(event.sender).dirty,
  };
});

ipcMain.on('locale:set', (_event, locale) => {
  setMainLocale(locale === 'en' ? 'en' : 'zh-CN');
});

ipcMain.handle('app:take-startup-path', (event) => {
  const state = windowStateOf(event.sender);
  const value = state.pendingPath ?? state.path ?? null;
  state.pendingPath = null;
  return value;
});

ipcMain.handle('app:renderer-ready', (event) => {
  const state = windowStateOf(event.sender);
  state.ready = true;
  const value = state.pendingPath;
  state.pendingPath = null;
  return value;
});

async function startMcpServer() {
  if (!mcpServer) {
    mcpServer = createMcpServer({
      port: MCP_PORT,
      token: mcpToken(),
      execute: (name, args) => executeRendererCommand(name, args),
    });
  }
  await mcpServer.start();
  setMcpEnabled(true);
  return mcpStatus();
}

ipcMain.handle('mcp:status', () => mcpStatus());

ipcMain.handle('mcp:enable', async () => {
  try {
    return { ok: true, ...(await startMcpServer()) };
  } catch (error) {
    return { ok: false, error: error?.message || String(error), ...mcpStatus() };
  }
});

ipcMain.handle('mcp:disable', async () => {
  try {
    await mcpServer?.stop();
    setMcpEnabled(false);
    return { ok: true, ...mcpStatus() };
  } catch (error) {
    return { ok: false, error: error?.message || String(error), ...mcpStatus() };
  }
});

function ensureBlankTemplate() {
  const file = path.join(app.getPath('userData'), '大肥鱼笔记.dfy');
  const blank = {
    version: 2,
    app: 'dafeiyu-notebook',
    title: mainT('untitled'),
    blocks: [{ id: 'b_blank', type: 'p', html: '', meta: {}, comments: [] }],
    markGroups: [],
    groups: [],
    toc: [],
  };
  fsSync.mkdirSync(path.dirname(file), { recursive: true });
  fsSync.writeFileSync(file, JSON.stringify(blank, null, 2), 'utf8');
  return file;
}

ipcMain.handle('app:register-file-association', async () => {
  if (process.platform !== 'win32') return { ok: false, error: mainT('windowsOnly') };
  const reg = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'reg.exe');
  const exe = process.execPath;
  const icon = fsSync.existsSync(APP_ICON) ? APP_ICON : exe;
  const progId = 'Dafeiyu.Notebook.dfy';
  const extension = 'HKCU\\Software\\Classes\\.dfy';
  const base = `HKCU\\Software\\Classes\\${progId}`;
  const entries = [
    [base, '大肥鱼笔记'],
    [`${base}\\DefaultIcon`, `"${icon}",0`],
    [`HKCU\\Software\\Classes\\Applications\\${path.basename(exe)}\\DefaultIcon`, `"${icon}",0`],
    [`${base}\\shell\\open\\command`, `"${exe}" "%1"`],
    [extension, progId],
  ];
  try {
    const template = ensureBlankTemplate();
    for (const [key, value] of entries) {
      await execFileAsync(reg, ['add', key, '/ve', '/t', 'REG_SZ', '/d', value, '/f']);
    }
    await execFileAsync(reg, ['delete', `${base}\\ShellNew`, '/f']).catch(() => {});
    await execFileAsync(reg, ['add', `${extension}\\ShellNew`, '/v', 'FileName', '/t', 'REG_SZ', '/d', template, '/f']);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error?.message || String(error) };
  }
});

ipcMain.handle('plugins:list', () => {
  ensurePlugins();
  const seen = new Set();
  const result = [];
  for (const dir of pluginRoots()) {
    let entries = [];
    try {
      entries = fsSync.readdirSync(dir, { withFileTypes: true }).filter((entry) => entry.isDirectory());
    } catch {
      continue;
    }
    for (const entry of entries) {
      const manifest = readManifest(dir, entry.name);
      if (!manifest || seen.has(manifest.id)) continue;
      seen.add(manifest.id);
      result.push(manifest);
    }
  }
  return result;
});

ipcMain.handle('plugins:open-dir', () => shell.openPath(ensurePlugins()));

ipcMain.handle('plugins:remove', async (_event, id) => {
  try {
    const safeId = String(id || '').replace(/[^a-zA-Z0-9._-]/g, '');
    if (!safeId) return { error: mainT('invalidPluginId') };
    // 只允许删除用户目录里的插件，内置示例不可删
    const base = path.resolve(pluginRoots()[0]);
    const target = path.resolve(base, safeId);
    if (!target.startsWith(base + path.sep)) return { error: mainT('invalidPath') };
    if (!fsSync.existsSync(target)) return { error: mainT('builtinPluginCannotDelete') };
    await fs.rm(target, { recursive: true, force: true });
    return { ok: true };
  } catch (error) {
    return { error: error.message || String(error) };
  }
});

/* ------------------------------------------------------------ boot */

const launchArg = process.argv.slice(app.isPackaged ? 1 : 2).find((arg) => /\.dfy$/i.test(arg));
const startupPath = launchArg ? authorizePath(launchArg) : null;
if (process.env.DAFEIYU_TEST_OPEN) authorizePath(process.env.DAFEIYU_TEST_OPEN);

const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', (_event, argv) => {
    const filePath = argv.find((arg) => /\.dfy$/i.test(arg));
    if (filePath) queueOpenPath(filePath);
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });

  app.whenReady().then(() => {
    Menu.setApplicationMenu(null);
    registerPluginProtocol();
    setMainLocale(app.getLocale().toLowerCase().startsWith('zh') ? 'zh-CN' : 'en');
    createWindow(startupPath);
    if (mcpEnabled()) {
      void startMcpServer().catch((error) => console.error('MCP start failed', error));
    }
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  void mcpServer?.stop();
});
